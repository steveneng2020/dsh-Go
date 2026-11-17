#!/usr/bin/env python3
"""把上游 dsh-Go 改成本 fork 的发行身份：包名、版本名、项目指向。

这是一个**幂等**脚本：对已经改过的树重复运行不产生任何变化。它是
`sync.sh` 的一部分——上游 rebase 进来之后，新增的 `.kt` 文件会带着旧包名，
必须再跑一遍把它拉回本 fork 的身份。

    python3 tooling/fork_rebrand.py            # 应用
    python3 tooling/fork_rebrand.py --check    # 只报告，有差异就 exit 1

改的东西：

1. Android 包标识 `dsh.android.go` → `dsh.android.go`
   （含 Kotlin `package`/`import`、`namespace`/`applicationId`、Manifest、
   shortcuts.xml、ohos ets、Dart 里的探针路径、文档里的 adb 命令）
2. Kotlin 源码目录 `src/*/kotlin/dsh/android/go` → `.../dsh/android/go`
3. 版本名（`X.Y.Z-fork.N`）：`app/pubspec.yaml`、`app_info.dart` 的
   `DSH_APP_VERSION` 默认值、两处 guide README 的 `> dsh-go <版本>` 行

**不动**的东西：`ccch1mneyyy/dsh-go` 这类 GitHub 仓库地址与作者署名。上游
`README.md` 的许可以及「fork 请标注主仓库与作者」要求保留归属，所以仓库
链接只在 `--upstream-links` 显式给出时才改。
"""

import argparse
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# ── 身份 ────────────────────────────────────────────────────────────────────
OLD_PKG = "io.github.ccch1mneyyy.dsh_app"
NEW_PKG = "dsh.android.go"
OLD_PATH = "io/github/ccch1mneyyy/dsh_app"
NEW_PATH = "dsh/android/go"

# 版本名：基于哪个上游版本 + 本 fork 第几版。见 docs/fork.md。
VERSION = "1.1.0-fork.1"

# 需要扫描包名的文本后缀。`.bin`/`.png`/`.jar` 这类二进制不碰。
TEXT_SUFFIXES = {
    ".kt", ".kts", ".java", ".xml", ".dart", ".py", ".sh", ".pro", ".md",
    ".ets", ".json", ".yml", ".yaml", ".gradle", ".properties", ".txt",
    ".mjs", ".js", ".cjs", ".ts", ".tsx", ".json5",
}

# 不扫描的目录：构建产物、依赖、VCS。
SKIP_DIRS = {
    ".git", "build", ".gradle", "node_modules", ".dart_tool", ".pytest_cache",
    "__pycache__", ".pub-cache", "out",
}

# 版本联动的四个落点。guide_sync.py:234 只认 `> dsh-go <版本>`，而
# tooling/test_build_number.py:24 要求 pubspec 与 app_info.dart 逐字相同。
VERSION_EDITS = [
    ("app/pubspec.yaml", re.compile(r"(?m)^version:[ \t]*\S+$"), f"version: {VERSION}"),
    (
        "app/lib/state/app_info.dart",
        re.compile(r"(String\.fromEnvironment\('DSH_APP_VERSION', defaultValue: ')[^']+(')"),
        rf"\g<1>{VERSION}\g<2>",
    ),
    ("docs/guide/README.md", re.compile(r"(?m)^> dsh-go \S+$"), f"> dsh-go {VERSION}"),
    ("docs/guide/harmony/README.md", re.compile(r"(?m)^> dsh-go \S+$"), f"> dsh-go {VERSION}"),
    ("app/assets/skills/dsh-go-guide/README.md", re.compile(r"(?m)^> dsh-go \S+$"), f"> dsh-go {VERSION}"),
    (
        "app/assets/skills/dsh-go-guide/harmony-README.md",
        re.compile(r"(?m)^> dsh-go \S+$"),
        f"> dsh-go {VERSION}",
    ),
]

# 源码根：包名目录在这几个源集下各有一份。
SRC_SETS = ["main", "test", "androidTest"]


# 不扫描的文件：本脚本要保留旧包名当搜索常量；docs/fork.md 要能写出
# 「旧包名 → 新包名」这段说明。
SKIP_FILES = {"tooling/fork_rebrand.py", "docs/fork.md"}

# 行级豁免：行尾写上 [KEEP] 的行（含上一行，处理行尾注释在上一行情形的例外不谈）
# 既不被改写，也不计入 leftovers。用于「必须原样引用上游包名」的说明文字，
# 例如 README：「上游是 io.github.ccch1mneyyy.dsh_app，两个是独立应用」。
KEEP = "fork-rebrand: keep"


def text_files(root: pathlib.Path):
    """[root] 下所有该扫描的文本文件，稳定的顺序。

    跳过 [SKIP_FILES]：本脚本必须保留旧包名当搜索常量，否则下一次运行就
    找不到要改的东西了（这是实际踩过的坑）；`docs/fork.md` 要能写出迁移说明。
    """
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        rel = path.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if rel.as_posix() in SKIP_FILES:
            continue
        yield path


def _kept(line: str) -> bool:
    return KEEP in line


def _strip_kept(text: str) -> str:
    """把带 [KEEP] 的行换成空行（保留行号），剩下的内容才参与改写与残留判定。"""
    return "\n".join("" if _kept(line) else line for line in text.split("\n"))


def rewrite_packages(root: pathlib.Path, apply: bool) -> list[str]:
    """替换文件内容里的包名，返回改过的相对路径。"""
    changed = []
    for path in text_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        scannable = _strip_kept(text)
        if OLD_PKG not in scannable and OLD_PATH not in scannable:
            continue
        new = "\n".join(
            line if _kept(line) else line.replace(OLD_PKG, NEW_PKG).replace(OLD_PATH, NEW_PATH)
            for line in text.split("\n")
        )
        if new == text:
            continue
        changed.append(str(path.relative_to(root)))
        if apply:
            path.write_text(new, encoding="utf-8")
    return changed


def move_sources(root: pathlib.Path, apply: bool) -> list[str]:
    """把 Kotlin 源码树从旧包名目录搬到新包名目录，返回搬过的源集。"""
    moved = []
    for src_set in SRC_SETS:
        base = root / "app" / "android" / "app" / "src" / src_set / "kotlin"
        old = base / OLD_PATH
        if not old.is_dir():
            continue
        new = base / NEW_PATH
        if old.resolve() == new.resolve() or new.resolve().is_relative_to(old.resolve()):
            # 旧常量被改坏时这里会自环（old == new），下面的「合并再删旧树」
            # 会把整棵树搬进自己再删光——实际踩过，610 个 .kt 全没了。
            continue
        moved.append(f"{src_set}: {OLD_PATH} -> {NEW_PATH}")
        if not apply:
            continue
        new.parent.mkdir(parents=True, exist_ok=True)
        if new.exists():
            # 目标已在（前一次跑过一半）：合并进去，然后删掉旧树。
            for item in old.iterdir():
                shutil.move(str(item), str(new / item.name))
            shutil.rmtree(old)
        else:
            shutil.move(str(old), str(new))
        # 清掉空的 io/github/ccch1mneyyy 父目录（不残留空壳）。
        for parent in (base / "io" / "github" / "ccch1mneyyy", base / "io" / "github", base / "io"):
            try:
                parent.rmdir()
            except OSError:
                break
    return moved


def rewrite_versions(root: pathlib.Path, apply: bool) -> list[str]:
    """把版本名设成 [VERSION]，返回改过的相对路径。"""
    changed = []
    for rel, pattern, replacement in VERSION_EDITS:
        path = root / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        new = pattern.sub(replacement, text)
        if new == text:
            continue
        changed.append(rel)
        if apply:
            path.write_text(new, encoding="utf-8")
    return changed


def leftovers(root: pathlib.Path) -> list[str]:
    """还带着旧包名的文件——`--check` 的判据，也用于跑完后的自检。"""
    found = []
    for path in text_files(root):
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        scannable = _strip_kept(text)
        if OLD_PKG in scannable or OLD_PATH in scannable:
            found.append(str(path.relative_to(root)))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="只报告差异，有差异就 exit 1")
    parser.add_argument("--root", type=pathlib.Path, default=ROOT, help="仓库根（默认本脚本的上级）")
    args = parser.parse_args()
    root = args.root.resolve()
    apply = not args.check

    packages = rewrite_packages(root, apply)
    moved = move_sources(root, apply)
    versions = rewrite_versions(root, apply)

    verb = "已改" if apply else "待改"
    if packages:
        print(f"{verb} {len(packages)} 个文件的包名：")
        for rel in packages[:20]:
            print(f"  {rel}")
        if len(packages) > 20:
            print(f"  … 另 {len(packages) - 20} 个")
    if moved:
        print(f"{verb} 源码目录：")
        for line in moved:
            print(f"  {line}")
    if versions:
        print(f"{verb} 版本名 → {VERSION}：")
        for rel in versions:
            print(f"  {rel}")

    if not (packages or moved or versions):
        print(f"已是 fork 身份：{NEW_PKG} {VERSION}，无需改动")

    if args.check:
        found = leftovers(root)
        if found:
            print(f"\n{len(found)} 个文件仍带旧包名：", file=sys.stderr)
            for rel in found[:20]:
                print(f"  {rel}", file=sys.stderr)
            return 1
        return 1 if (packages or moved or versions) else 0

    found = leftovers(root)
    if found:
        print(f"\n自检失败：{len(found)} 个文件仍带旧包名", file=sys.stderr)
        for rel in found[:20]:
            print(f"  {rel}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
