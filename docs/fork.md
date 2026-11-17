# 本 fork 的发行身份与同步规则

这个仓库是 [ccch1mneyyy/dsh-go](https://github.com/ccch1mneyyy/dsh-go) 的 fork，以
独立应用的身份发布：包名 `dsh.android.go`，自己的签名密钥，自己的更新源。

主仓库与原作者是 [ccch1mneyyy/dsh-go](https://github.com/ccch1mneyyy/dsh-go) /
[ccch1mneyyy](https://github.com/ccch1mneyyy)。代码以 AGPL-3.0 发布；品牌与吉祥物
素材不在 AGPL 授权范围内，见 [ASSETS.md](../ASSETS.md)。

## 为什么要 fork 成独立应用

上游不接受外部 PR（`.github/workflows/pr-gate.yml` 会自动关闭），所以本 fork 的功能
改动不会进入上游。同时上游每天几十到几百个提交、频繁重写历史，直接在自己的 `main`
上开发会让每次同步都变成一场冲突处理。

因此这里用一条硬规则把「跟随上游」和「自己的改动」分开：

```
main        上游镜像。只有 reset 对齐，不放任何自己的实现。
feat/*      自己的功能。基线永远是当时的 upstream/main。
fork/main   发布分支 = 上游 + 两条特性 + 本 fork 的发行身份（包名、版本、文案）。
```

## 分支与发版

`fork/main` 是唯一带发行身份的分支。它的提交有三层，由下到上：

1. `upstream/main` 的快照
2. 两条特性分支（`feat/composer-upload-menu`、`feat/composer-ref`）的合并
3. 一次提交，内容是 `python3 tooling/fork_rebrand.py` 的产物

第 3 层是每次同步都要重做的，因为 rebase 进来的上游代码带着旧包名和新文件路径。

## 版本号：`X.Y.Z-fork.N`

```
1.1.0-fork.1
│ │ │  │   └── 本 fork 第几次发版
│ │ │  └────── 固定为 fork，标明不是官方版本
│ │ └───────── 所基于的上游版本
└─┴─────────── 跟着上游走
```

**为什么这么定**

- `X.Y.Z` 直接对应上游版本，一眼看出落后几个版本；上游升到 1.2.0 时本 fork 变成
  `1.2.0-fork.1`，`N` 归 1。
- 不占 `1.1.1`：不跟上游未来的版本号撞车，也不会让人误以为是官方的小版本。
- 满足三处格式校验：`tooling/build-apk.sh:80`、`tooling/release_assets.py:44`
  （`VERSION_RE`）、`app/lib/update/version.dart:19`（`_pattern`）都接受这个形状。
- 升级判定不受影响：`AppVersion.compareTo`（`app/lib/update/version.dart:47`）先比
  major/minor/patch，再比 prerelease，`fork.1` → `fork.2` 是递增的。包名不同意味着它
  和官方版是两个独立应用，本就不做跨应用版本比较。

**versionCode 与版本名无关**：`app/android/app/build.gradle.kts:31` 的
`buildMinuteVersionCode()` 取构建时刻（UTC+8）编码成分钟数，与
`tooling/build_number.py` 同一套编码。它单调递增，Android 靠它判断能否覆盖安装。
同一版本名重新打包不算新版本。

**改版本名要动 5 个文件**，`tooling/fork_rebrand.py` 会一起改，
`tooling/test_build_number.py` 会校验它们一致：

| 文件 | 内容 |
|---|---|
| `app/pubspec.yaml` | `version: 1.1.0-fork.1` |
| `app/lib/state/app_info.dart` | `DSH_APP_VERSION` 的 `defaultValue` |
| `docs/guide/README.md` | `> dsh-go 1.1.0-fork.1` |
| `app/assets/skills/dsh-go-guide/README.md` | 同上 |
| `app/assets/skills/dsh-go-guide/harmony-README.md` | 同上 |

## 同步上游：三步，不是一步

```bash
bash "/sdcard/Download/DSH/DSH Go开发/脚本/dev.sh" sync
```

展开成：

1. `git fetch upstream` 并把 `main` 对齐到 `upstream/main`
2. 特性分支 `rebase` 到 `upstream/main`；`fork/main` 用 `git rebase --onto` 只重放
   自己的提交，**不重放**上游历史（上游频繁重写历史，fork 侧会残留上千个内容等价、
   ID 不同的旧提交，朴素 rebase 会把它们全部重放并卡死）
3. 跑 `python3 tooling/fork_rebrand.py`，把上游带进来的旧包名、旧路径、上游版本名
   拉回本 fork 的身份，然后提交

第 3 步是幂等的：对已经改过的树重复运行不产生任何变化，`--check` 只报告不写入。
它必须在第 2 步之后跑，因为 rebase 会引入新的 `.kt` 文件。

### 冲突怎么处理

`fork_rebrand.py` 只改包名/版本名这一类**机械**内容，不碰业务逻辑。所以：

- 上游改了同名文件 → 普通文本冲突，按上游逻辑解决，然后再跑一次 `fork_rebrand.py`
- 上游新增 `.kt` → 不冲突，脚本自动改包名并搬到 `dsh/android/go/` 下
- 上游新增 `app/android/app/src/*/kotlin/io/github/...` 目录 → 脚本自动搬迁

真正会冲突的是两条特性分支碰过的文件（`composer.dart`、`chat_screen.dart`、
`plus_panel.dart`、l10n 生成物、golden PNG）。这些冲突和 fork 无关，是功能改动的
正常成本。

## 包名改了什么

`io.github.ccch1mneyyy.dsh_app` → `dsh.android.go`，涉及 3 类：

1. **Android 标识**：`app/android/app/build.gradle.kts:38` 的 `namespace`、`:52` 的
   `applicationId`，以及 `AndroidManifest.xml`、`res/xml/shortcuts.xml` 里的自引用
   action 字符串
2. **Kotlin 源码树**：`app/android/app/src/{main,test,androidTest}/kotlin/` 下整棵树
   从 `io/github/ccch1mneyyy/dsh_app/` 搬到 `dsh/android/go/`，610 个 `.kt` 的
   `package` 与 `import` 一起改（含 10 处 `import ...dsh_app.R`）
3. **跨语言引用**：Dart 侧的探针路径、鸿蒙 ets 的 action 常量、`runtime/tests/ohos/`
   里的 `bundleName`、文档里的 adb 命令

大量代码用 `context.packageName` 派生 provider authority（如
`FilesPlugin.kt:151`），改 `applicationId` 即自动跟随，不需要逐处改。

## 不要再改的东西

- `ccch1mneyyy/dsh-go` 这类仓库地址、`app/lib/state/app_info.dart:33` 的 `author`：
  上游的许可与署名要求保留归属，见 [README.md](../README.md) 的「授权范围与再发布」
- `app/assets/brand/`、`app/assets/pets/`、`app/assets/whale/` 里的品牌与吉祥物素材：
  不在 AGPL 授权范围内，本 fork 沿用但不声称拥有，见 [ASSETS.md](../ASSETS.md)

## 自己的更新源

`app/lib/update/update_config.dart:24` 的 `updateRepo` 指向上游仓库时，App 会去查
上游的 `update.json`。本 fork 要指向自己的发布页，并可用 `--dart-define` 覆盖而无需
改代码（`update_config.dart:150-186`）：

```bash
--dart-define=DSH_UPDATE_FEED=<自己的 update.json 地址>
--dart-define=DSH_UPDATE_MIRROR=<镜像>
```
