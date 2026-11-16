window.__ModuleLoader__.load({
	id: "dsh-composer-kit",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const ReactDOM = require("react-dom");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		const h = React.createElement;
		const SLOT = "conversation.input.left";
		const ENTRY_ID = "dsh-composer-kit.upload-menu";

		// ── dictionaries ────────────────────────────────────────────────────
		// Kept local (not ctx.locale) so the kit has no locale dependency and
		// still reads correctly before the locale service has any language.
		const DICT = {
			zh: {
				trigger: "上传菜单",
				image: "图片",
				file: "文件",
				folder: "文件夹",
				path: "输入路径",
				pathTitle: "输入文件路径",
				pathHint: "支持任意本地绝对路径下的文件和文件夹",
				pathLabel: "绝对路径",
				cancel: "取消",
				insert: "添加",
				busy: "处理中…",
				noSession: "会话不可用，无法上传文件",
				folderTitle: "选择文件夹",
				folderHome: "主目录",
				folderUse: "使用此文件夹",
				folderEmpty: "这个文件夹里没有子文件夹",
				folderFailed: "读不到这个文件夹"
			},
			en: {
				trigger: "Upload menu",
				image: "Image",
				file: "File",
				folder: "Folder",
				path: "Enter path",
				pathTitle: "Enter a file path",
				pathHint: "Any absolute path on this machine, file or folder",
				pathLabel: "Absolute path",
				cancel: "Cancel",
				insert: "Add",
				busy: "Working…",
				noSession: "This session cannot take uploads",
				folderTitle: "Choose a folder",
				folderHome: "Home",
				folderUse: "Use this folder",
				folderEmpty: "No subfolders here",
				folderFailed: "Cannot read this folder"
			}
		};

		function pickDict() {
			const raw =
				typeof navigator !== "undefined" && typeof navigator.language === "string"
					? navigator.language
					: "";
			return /^zh/i.test(raw) ? DICT.zh : DICT.en;
		}

		// ── path helpers (mirror the shipped formatFileMention / relativizeToCwd)
		const UNSAFE = /[\u0000-\u001f\u007f-\u009f"]/u;
		const SPACE = /\s/u;

		/** `@path` for a file, `@path/` (or `@"path/`) for a directory. */
		function formatMention(path, directory) {
			const full = directory ? `${path}/` : path;
			if (UNSAFE.test(full)) return void 0;
			if (!SPACE.test(full)) return `@${full}`;
			// An open quote keeps the mention extendable while the user keeps
			// drilling into the same directory, exactly like the shipped chips.
			return directory ? `@"${full}` : `@"${full}"`;
		}

		function relativizeToCwd(path, cwd) {
			if (typeof cwd !== "string" || cwd === "") return path;
			const root = cwd.replace(/[/\\]+$/, "");
			if (path.startsWith(`${root}/`) || path.startsWith(`${root}\\`)) return path.slice(root.length + 1);
			return path;
		}

		// ── styles ──────────────────────────────────────────────────────────
		const CSS = `
.dck-trigger{width:28px;height:28px;border-radius:999px;border:0;padding:0;display:grid;place-items:center;cursor:pointer;color:var(--dsw-alias-label-secondary,#5c5c5c);background:var(--dsw-specific-selector,rgba(0,0,0,.06));-webkit-tap-highlight-color:transparent}
.dck-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.1))}
.dck-trigger:disabled{opacity:.45;cursor:default}
.dck-trigger[data-open=true]{background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.12))}
.dck-menu{position:fixed;z-index:2147483000;min-width:158px;padding:4px;border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.1));box-shadow:var(--dsw-elevation-panel,0 8px 28px rgba(0,0,0,.18));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(12px));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(12px))}
.dck-item{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:9px 10px;border:0;border-radius:var(--dsw-radius-sm,8px);background:none;cursor:pointer;text-align:left;font:inherit;font-size:14px;line-height:20px;color:var(--dsw-alias-label-primary,#1a1a1a);-webkit-tap-highlight-color:transparent}
.dck-item:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dck-item:disabled{opacity:.45;cursor:default}
.dck-scrim{position:fixed;inset:0;z-index:2147482999;background:transparent}
.dck-modal{position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.32))}
.dck-card{width:100%;max-width:380px;box-sizing:border-box;padding:18px;border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:var(--dsw-elevation-prominent,0 20px 60px rgba(0,0,0,.28))}
.dck-title{margin:0 0 4px;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#1a1a1a)}
.dck-hint{margin:0 0 12px;font-size:12.5px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}
.dck-input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:var(--dsw-radius-sm,8px);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:14px;outline:none}
.dck-input:focus{border-color:var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary,#3b6cf0));box-shadow:0 0 0 3px var(--dsw-alias-interactive-bg-hover,rgba(59,108,240,.16))}
.dck-row{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.dck-btn{padding:8px 14px;border-radius:var(--dsw-radius-sm,8px);border:1px solid transparent;font:inherit;font-size:14px;cursor:pointer}
.dck-btn[data-variant=cancel]{background:none;border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.14));color:var(--dsw-alias-label-secondary,#5c5c5c)}
.dck-btn[data-variant=ok]{background:var(--dsw-alias-button-primary-fill,#3b6cf0);color:#fff}
.dck-btn:disabled{opacity:.5;cursor:default}
.dck-card[data-kind=folder]{display:flex;flex-direction:column;max-height:min(78vh,620px)}
.dck-crumbs{display:flex;align-items:center;gap:2px;margin:0 0 10px;overflow-x:auto;white-space:nowrap;scrollbar-width:none}
.dck-crumbs::-webkit-scrollbar{display:none}
.dck-crumb{flex:0 0 auto;padding:4px 6px;border:0;border-radius:var(--dsw-radius-xs,6px);background:none;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-secondary,#5c5c5c);cursor:pointer;max-width:158px;overflow:hidden;text-overflow:ellipsis;-webkit-tap-highlight-color:transparent}
.dck-crumb:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dck-crumb[data-current=true]{color:var(--dsw-alias-label-primary,#1a1a1a);font-weight:600}
.dck-crumb-sep{flex:0 0 auto;color:var(--dsw-alias-label-tertiary,#8a8a8a);font-size:11px}
.dck-list{flex:1 1 auto;min-height:120px;overflow-y:auto;margin:0 -6px;padding:0 6px;overscroll-behavior:contain}
.dck-dir{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;padding:10px 8px;border:0;border-radius:var(--dsw-radius-sm,8px);background:none;cursor:pointer;text-align:left;font:inherit;font-size:14px;color:var(--dsw-alias-label-primary,#1a1a1a);-webkit-tap-highlight-color:transparent}
.dck-dir:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}
.dck-dir-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dck-note{padding:16px 8px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary,#8a8a8a)}
.dck-pathbar{margin:10px 0 0;font-size:12px;line-height:17px;color:var(--dsw-alias-label-tertiary,#8a8a8a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}
`;

		function ensureStyles() {
			const tag = document.createElement("style");
			tag.dataset.dshComposerKit = "1";
			tag.textContent = CSS;
			document.head.append(tag);
			return () => {
				tag.remove();
			};
		}

		// ── path entry dialog ───────────────────────────────────────────────
		function PathDialog({ dict, onSubmit, onClose }) {
			const [value, setValue] = React.useState("");
			const [busy, setBusy] = React.useState(false);
			const inputRef = React.useRef(null);

			React.useEffect(() => {
				const node = inputRef.current;
				if (node !== null) node.focus();
			}, []);

			React.useEffect(() => {
				const onKey = (event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						onClose();
					}
				};
				document.addEventListener("keydown", onKey, true);
				return () => document.removeEventListener("keydown", onKey, true);
			}, [onClose]);

			const submit = React.useCallback(async () => {
				const text = value.trim();
				if (text === "" || busy) return;
				setBusy(true);
				try {
					const done = await onSubmit(text);
					if (done === true) onClose();
				} finally {
					setBusy(false);
				}
			}, [busy, onClose, onSubmit, value]);

			return ReactDOM.createPortal(
				h(
					"div",
					{
						className: "dck-modal",
						onMouseDown: (event) => {
							if (event.target === event.currentTarget) onClose();
						}
					},
					h(
						"div",
						{ className: "dck-card", role: "dialog", "aria-label": dict.pathTitle },
						h("p", { className: "dck-title" }, dict.pathTitle),
						h("p", { className: "dck-hint" }, dict.pathHint),
						h("input", {
							ref: inputRef,
							className: "dck-input",
							value,
							spellCheck: false,
							autoCapitalize: "off",
							autoCorrect: "off",
							placeholder: dict.pathLabel,
							"aria-label": dict.pathLabel,
							onChange: (event) => setValue(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									submit();
								}
							}
						}),
						h(
							"div",
							{ className: "dck-row" },
							h(
								"button",
								{ type: "button", className: "dck-btn", "data-variant": "cancel", onClick: onClose },
								dict.cancel
							),
							h(
								"button",
								{
									type: "button",
									className: "dck-btn",
									"data-variant": "ok",
									disabled: busy || value.trim() === "",
									onClick: submit
								},
								busy ? dict.busy : dict.insert
							)
						)
					)
				),
				document.body
			);
		}

		// ── folder browser ──────────────────────────────────────────────────
		/**
		 * Pick a directory through the host's `browse` backend. The composer runs
		 * on hosts whose directory picker may have no `pick()` at all (the browse
		 * backend only lists), so the browser is built from `listDirectory` — the
		 * one primitive every backend serves.
		 */
		function FolderBrowser({ dict, workspace, onSubmit, onClose }) {
			const [listing, setListing] = React.useState(null);
			const [error, setError] = React.useState(false);
			// Starts true: the first listing is in flight from the very first paint,
			// so the browser never flashes "cannot read" before it answers.
			const [busy, setBusy] = React.useState(true);
			const seq = React.useRef(0);

			const load = React.useCallback(
				async (path) => {
					const turn = ++seq.current;
					setBusy(true);
					setError(false);
					try {
						const next = await workspace.listDirectory(path);
						if (turn !== seq.current || next === void 0) return;
						setListing(next);
					} catch (failure) {
						if (turn !== seq.current) return;
						console.warn("[dsh-composer-kit] list failed", failure);
						setError(true);
					} finally {
						if (turn === seq.current) setBusy(false);
					}
				},
				[workspace]
			);

			React.useEffect(() => {
				load(void 0);
				return () => {
					seq.current += 1;
				};
			}, [load]);

			const entries = listing === null ? [] : listing.entries;
			const current = listing === null ? "" : listing.path;

			const crumbs =
				listing === null
					? null
					: h(
							"nav",
							{ className: "dck-crumbs", "aria-label": dict.folderTitle },
							listing.crumbs.flatMap((crumb, index) => {
								const at = crumb.path;
								const label = at === listing.home ? dict.folderHome : crumb.name;
								const seat = h(
									"button",
									{
										key: `crumb-${at}`,
										type: "button",
										className: "dck-crumb",
										"data-current": at === current ? "true" : "false",
										title: at,
										onClick: () => void load(at)
									},
									label
								);
								return index === 0
									? [seat]
									: [h("span", { key: `sep-${at}`, className: "dck-crumb-sep" }, "/"), seat];
							})
						);

			const body =
				listing === null
					? h("p", { className: "dck-note" }, busy ? dict.busy : dict.folderFailed)
					: entries.length === 0
						? h("p", { className: "dck-note" }, dict.folderEmpty)
						: h(
								"div",
								{ className: "dck-list", role: "listbox", "aria-label": dict.folderTitle },
								entries.map((entry) =>
									h(
										"button",
										{
											key: entry.path,
											type: "button",
											role: "option",
											"aria-selected": false,
											className: "dck-dir",
											title: entry.path,
											onClick: () => void load(entry.path)
										},
										h(primitives.IconFolderOpenRegular, { size: 16 }),
										h("span", { className: "dck-dir-name" }, entry.name)
									)
								)
							);

			return ReactDOM.createPortal(
				h(
					"div",
					{
						className: "dck-modal",
						onMouseDown: (event) => {
							if (event.target === event.currentTarget) onClose();
						}
					},
					h(
						"div",
						{ className: "dck-card", "data-kind": "folder", role: "dialog", "aria-label": dict.folderTitle },
						h("p", { className: "dck-title" }, dict.folderTitle),
						crumbs,
						error ? h("p", { className: "dck-note" }, dict.folderFailed) : body,
						h("p", { className: "dck-pathbar", title: current }, current),
						h(
							"div",
							{ className: "dck-row" },
							h(
								"button",
								{ type: "button", className: "dck-btn", "data-variant": "cancel", onClick: onClose },
								dict.cancel
							),
							h(
								"button",
								{
									type: "button",
									className: "dck-btn",
									"data-variant": "ok",
									disabled: busy || listing === null || current === "",
									onClick: () => {
										if (listing === null || current === "") return;
										if (onSubmit(current) === true) onClose();
									}
								},
								dict.folderUse
							)
						)
					)
				),
				document.body
			);
		}

		// ── the composer entry ──────────────────────────────────────────────
		/**
		 * Build the seat component. The entry cannot read cordis, so the plugin
		 * hands it a lazily-resolving view of the three services it needs: the
		 * composer tool row may mount before the workspace provider does.
		 */
		function createUploadMenu(services) {
			function UploadMenu({ sessionId, inputActions }) {
				const dict = React.useMemo(() => pickDict(), []);
				const [open, setOpen] = React.useState(false);
				const [dialog, setDialog] = React.useState(false);
				const [folderDialog, setFolderDialog] = React.useState(false);
				const [anchor, setAnchor] = React.useState(null);
				const [busy, setBusy] = React.useState(false);
				const triggerRef = React.useRef(null);
				const imageRef = React.useRef(null);
				const fileRef = React.useRef(null);

				const live = typeof sessionId === "string" && sessionId !== "" && inputActions !== void 0;

				const closeMenu = React.useCallback(() => setOpen(false), []);

				// Close on viewport changes only. Listening to document scroll
				// would also fire for the transcript's own autoscroll, which the
				// streaming reply runs for the whole turn — the menu would blink
				// shut while the user is still choosing.
				React.useEffect(() => {
					if (!open) return void 0;
					const close = () => setOpen(false);
					window.addEventListener("resize", close);
					window.addEventListener("orientationchange", close);
					return () => {
						window.removeEventListener("resize", close);
						window.removeEventListener("orientationchange", close);
					};
				}, [open]);

				const toggle = React.useCallback(() => {
					const node = triggerRef.current;
					if (node === null) return;
					if (open) {
						setOpen(false);
						return;
					}
					setAnchor(node.getBoundingClientRect());
					setOpen(true);
				}, [open]);

				/** Insert `@mention` at the caret and keep the composer focused. */
				const insertMention = React.useCallback(
					(path, directory) => {
						if (!live) return false;
						const cwd = services.sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd;
						const mention = formatMention(relativizeToCwd(path, cwd), directory);
						if (mention === void 0) return false;
						const span = inputActions.captureInsertion();
						if (inputActions.insertText(`${mention} `, span)) return true;
						// The draft moved under us (another edit landed first) — retry
						// once with a fresh caret so a normal click never fails silently.
						return inputActions.insertText(`${mention} `, inputActions.captureInsertion());
					},
					[inputActions, live, services, sessionId]
				);

				/** Hand picked files to the shipped draft pipeline (thumbnails, uploads). */
				const attachFiles = React.useCallback(
					(files) => {
						if (!live || files.length === 0) return false;
						const conversation = services.conversation;
						if (conversation === void 0) return false;
						const shell = conversation.input.shell(sessionId);
						const drafts = conversation.createDrafts(sessionId, files, true);
						if (!shell.addFiles([], drafts.map((draft) => draft.id))) {
							conversation.releaseDraftAttachments(drafts);
							return false;
						}
						return true;
					},
					[live, services, sessionId]
				);

				const pickFiles = React.useCallback(
					(kind) => {
						setOpen(false);
						const node = kind === "image" ? imageRef.current : fileRef.current;
						if (node !== null) node.click();
					},
					[]
				);

				const onPicked = React.useCallback(
					(event) => {
						const picked = event.target.files === null ? [] : [...event.target.files];
						event.target.value = "";
						if (picked.length === 0) return;
						setBusy(true);
						try {
							attachFiles(picked);
						} finally {
							setBusy(false);
						}
					},
					[attachFiles]
				);

				const pickFolder = React.useCallback(() => {
					setOpen(false);
					setFolderDialog(true);
				}, []);

				const submitPath = React.useCallback(
					(text) => {
						const trimmed = text.trim();
						if (trimmed === "") return false;
						const directory = trimmed.endsWith("/");
						const path = directory ? trimmed.replace(/\/+$/, "") : trimmed;
						if (path === "") return false;
						return insertMention(path, directory);
					},
					[insertMention]
				);

				const items = [
					{ id: "image", label: dict.image, run: () => pickFiles("image") },
					{ id: "file", label: dict.file, run: () => pickFiles("file") },
					{
						id: "folder",
						label: dict.folder,
						disabled: services.workspace === void 0,
						run: pickFolder
					},
					{ id: "path", label: dict.path, run: () => { setOpen(false); setDialog(true); } }
				];

				const menu =
					open && anchor !== null
						? ReactDOM.createPortal(
								h(
									React.Fragment,
									null,
									h("div", { className: "dck-scrim", onPointerDown: closeMenu }),
									h(
										"div",
										{
											className: "dck-menu",
											role: "menu",
											style: menuStyle(anchor, items.length)
										},
										items.map((item) =>
											h(
												"button",
												{
													key: item.id,
													type: "button",
													role: "menuitem",
													className: "dck-item",
													disabled: item.disabled === true,
													onClick: () => item.run()
												},
												item.label
											)
										)
									)
								),
								document.body
							)
						: null;

				return h(
					React.Fragment,
					null,
					h(
						"button",
						{
							ref: triggerRef,
							type: "button",
							className: "dck-trigger",
							"data-open": open ? "true" : "false",
							"aria-label": dict.trigger,
							"aria-haspopup": "menu",
							"aria-expanded": open ? "true" : "false",
							title: live ? dict.trigger : dict.noSession,
							disabled: !live || busy,
							onClick: toggle
						},
						h(primitives.IconPaperclipOutlineMedium, { size: 16 })
					),
					h("input", {
						ref: imageRef,
						type: "file",
						accept: "image/*",
						multiple: true,
						hidden: true,
						onChange: onPicked
					}),
					h("input", { ref: fileRef, type: "file", multiple: true, hidden: true, onChange: onPicked }),
					menu,
					dialog
						? h(PathDialog, {
								dict,
								onSubmit: submitPath,
								onClose: () => setDialog(false)
							})
						: null,
					folderDialog && services.workspace !== void 0
						? h(FolderBrowser, {
								dict,
								workspace: services.workspace,
								onSubmit: (path) => insertMention(path, true),
								onClose: () => setFolderDialog(false)
							})
						: null,
				);
			}

			return UploadMenu;
		}

		/** Place the panel above the trigger, clamped to the viewport. */
		function menuStyle(rect, rows) {
			const width = 158;
			const height = rows * 38 + 8;
			const margin = 8;
			const left = Math.min(
				Math.max(margin, rect.left),
				Math.max(margin, window.innerWidth - width - margin)
			);
			const above = rect.top - height - 6;
			const top = above >= margin ? above : Math.min(rect.bottom + 6, window.innerHeight - height - margin);
			return { left: `${left}px`, top: `${top}px`, width: `${width}px` };
		}

		// ── plugin body ─────────────────────────────────────────────────────
		// Only the slot seat is required. The three services the menu reaches
		// for are read through ctx.get(), so the entry still mounts (disabled)
		// when a provider is missing or momentarily unloaded.
		const inject = ["slots"];

		function apply(ctx) {
			ctx.effect(() => ensureStyles(), "composer-kit: styles");

			// Lazy getters: the seat may mount before a provider has loaded, and
			// the runtime parks the package if one unloads later.
			const services = {
				get conversation() {
					return ctx.get("conversation");
				},
				get sessions() {
					return ctx.get("sessions");
				},
				get workspace() {
					return ctx.get("uiWorkspace");
				}
			};

			ctx.slots.inject(SLOT, () =>
				ctx.slots.register(
					{
						name: SLOT,
						id: ENTRY_ID,
						order: 10,
						label: "Upload menu"
					},
					createUploadMenu(services)
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
