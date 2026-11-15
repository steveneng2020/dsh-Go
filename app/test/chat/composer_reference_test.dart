// 引用路径 in the ＋ panel: 文件夹 and 输入路径 put an `@path` into the draft
// (the same grammar the `@` picker writes) instead of attaching a file, and
// both rows are offered only while the live host can resolve references.

import 'package:dsh_app/state/connection_state.dart';
import 'package:dsh_app/state/draft_store.dart';
import 'package:dsh_app/ui/chat/chat_screen.dart';
import 'package:dsh_client/dsh_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'support/composer_fakes.dart';
import 'support/harness.dart';

/// A host that resolves `@` references and, with [browse], lists folders.
class _Host extends FakeRpcCarrier {
  _Host({this.browse = true})
    : super({
        'fileReferences/list': (_) => const [],
        'sessionReferenceResolver/candidates': (_) => const [],
        'directoryPicker/list': (args) {
          final path = (args['path'] as String?) ?? '/root/workshop';
          return {
            'path': path,
            'home': '/root/workshop',
            'crumbs': [
              {'name': '/', 'path': '/', 'hidden': false},
              {'name': 'root', 'path': '/root', 'hidden': false},
              {'name': 'workshop', 'path': '/root/workshop', 'hidden': false},
            ],
            'entries': [
              {'name': 'src', 'path': '$path/src', 'hidden': false},
            ],
            'truncated': false,
          };
        },
      });

  /// False: the carrier serves references but not the folder browser.
  final bool browse;

  @override
  bool allowsEndpoint(String endpoint) => browse || !endpoint.startsWith('directoryPicker/');
}

Future<ChatHarness> _pump(WidgetTester tester, {bool browse = true}) async {
  usePhoneView(tester);
  mockClipboard(tester);
  final client = DshClient.withCarrier(_Host(browse: browse));
  final host = HostConnection(client: client, isLocal: false);
  final harness = ChatHarness(session: 's1');
  await tester.pumpWidget(
    testApp(
      const ChatScreen(),
      overrides: [
        // The panel asks the live connection what it can do.
        for (final o in harness.overrides)
          if (o.origin != activeConnectionProvider) o,
        activeConnectionProvider.overrideWithValue(AsyncData<HostConnection?>(host)),
      ],
    ),
  );
  await pumpFrames(tester);
  return harness;
}

void main() {
  testWidgets('输入路径 puts an @path into the draft, sending nothing', (tester) async {
    final harness = await _pump(tester);
    await tester.tap(find.bySemanticsLabel('添加图片或文件'));
    await pumpFrames(tester);
    await tester.tap(find.text('输入路径'));
    await pumpFrames(tester);

    await tester.enterText(find.byType(TextField).last, '/root/notes/plan.md');
    await tester.tap(find.text('前往'));
    await pumpFrames(tester);

    expect(ProviderScope.containerOf(tester.element(find.byType(ChatScreen))).read(draftStoreProvider).drafts['s1']!.text.trim(), '@/root/notes/plan.md');
    expect(harness.controllers['s1']!.sent, isEmpty);
  });

  testWidgets('文件夹 browses and inserts the folder as a trailing-slash reference', (tester) async {
    final harness = await _pump(tester);
    await tester.tap(find.bySemanticsLabel('添加图片或文件'));
    await pumpFrames(tester);
    await tester.tap(find.text('文件夹'));
    await pumpFrames(tester);

    // 起点 sheet first: 主目录 opens the browser, whose button confirms.
    await tester.tap(find.text('主目录'));
    await pumpFrames(tester);
    await tester.tap(find.textContaining('选择'));
    await pumpFrames(tester);

    expect(ProviderScope.containerOf(tester.element(find.byType(ChatScreen))).read(draftStoreProvider).drafts['s1']!.text.trim(), '@/root/workshop/');
    expect(harness.controllers['s1']!.sent, isEmpty);
  });

  testWidgets('without the folder browser only 输入路径 is offered', (tester) async {
    await _pump(tester, browse: false);
    await tester.tap(find.bySemanticsLabel('添加图片或文件'));
    await pumpFrames(tester);
    expect(find.text('引用路径'), findsOneWidget);
    expect(find.text('文件夹'), findsNothing);
    expect(find.text('输入路径'), findsOneWidget);
  });
}
