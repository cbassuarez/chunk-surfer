// Offscreen AppKit lifecycle checks. No NSApplication, NSWindow, Dock install,
// preference writes, WebView, game session, audio or GPU capture is created.
#define CS_DOCK_ASSEMBLY_TESTING 1
#import "../../../src-tauri/macos/DockTile/DockAssembly.m"

int main(int argc, const char **argv) {
    @autoreleasepool {
        if (argc != 3) { fputs("usage: van-dock-native VAN_ICNS LAUNCH_PNG\n", stderr); return 2; }
        NSImage *image = [[NSImage alloc] initWithContentsOfFile:[NSString stringWithUTF8String:argv[1]]];
        NSImage *atlas = [[NSImage alloc] initWithContentsOfFile:[NSString stringWithUTF8String:argv[2]]];
        NSBitmapImageRep *bitmap = [NSBitmapImageRep imageRepWithContentsOfFile:[NSString stringWithUTF8String:argv[2]]];
        BOOL assets = image != nil && atlas != nil && bitmap.pixelsWide == CSVLaunchColumns * CSVLaunchCellSize
            && bitmap.pixelsHigh == CSVLaunchRows * CSVLaunchCellSize;
        // VanLaunch.inc is the single contract for production and this
        // harness. The atlas can end partway through its final occupied row.
        const CGFloat cell = CSVLaunchCellSize;
        const NSUInteger lastFrame = CSVLaunchFrameCount - 1;
        const NSUInteger lastRow = lastFrame / CSVLaunchColumns;
        const NSUInteger firstInLastRow = lastRow * CSVLaunchColumns;
        const CGFloat topY = (CSVLaunchRows - 1) * cell;
        const CGFloat lastY = (CSVLaunchRows - 1 - lastRow) * cell;
        BOOL mapping = CSVLaunchFrameCount > CSVLaunchColumns
            && CSVLaunchRows == (CSVLaunchFrameCount + CSVLaunchColumns - 1) / CSVLaunchColumns
            && NSEqualRects(CSLaunchFrameRect(0), NSMakeRect(0, topY, cell, cell))
            && NSEqualRects(CSLaunchFrameRect(CSVLaunchColumns - 1), NSMakeRect((CSVLaunchColumns - 1) * cell, topY, cell, cell))
            && NSEqualRects(CSLaunchFrameRect(CSVLaunchColumns), NSMakeRect(0, topY - cell, cell, cell))
            && NSEqualRects(CSLaunchFrameRect(firstInLastRow), NSMakeRect(0, lastY, cell, cell))
            && NSEqualRects(CSLaunchFrameRect(lastFrame), NSMakeRect((lastFrame % CSVLaunchColumns) * cell, lastY, cell, cell))
            && NSEqualRects(CSLaunchFrameRect(CSVLaunchFrameCount + CSVLaunchColumns), CSLaunchFrameRect(lastFrame));
        BOOL monotonic = CSVLaunchDuration > 0 && CSLaunchFrame(-CSVLaunchDuration) == 0 && CSLaunchFrame(0) == 0
            && CSLaunchFrame(CSVLaunchDuration * .5) == lastFrame / 2
            && CSLaunchFrame(CSVLaunchDuration) == lastFrame
            && CSLaunchFrame(CSVLaunchDuration * 10) == lastFrame;
        NSUInteger previous = 0;
        const NSUInteger samples = CSVLaunchFrameCount * 4;
        for (NSUInteger i = 0; i <= samples; i++) {
            NSUInteger frame = CSLaunchFrame(CSVLaunchDuration * i / samples);
            if (frame < previous || frame >= CSVLaunchFrameCount) monotonic = NO;
            previous = frame;
        }
        if (!assets) { fputs("Dock resources failed to decode or have the wrong atlas size.\n", stderr); return 1; }
        CSDockAssemblyView *timed = [[CSDockAssemblyView alloc]
            initWithFrame:NSMakeRect(0, 0, 128, 128) image:image atlas:atlas tile:nil];
        [timed start];
        BOOL started = timed.timerIsValidForTesting;
        BOOL respectsSystem = started || NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion;
        // Deliberately starve the run loop; one callback must finish directly,
        // rather than replaying the missed launch frames after the stall.
        [NSThread sleepForTimeInterval:CSVLaunchDuration + .15];
        [NSRunLoop.mainRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.08]];
        BOOL completed = !timed.timerIsValidForTesting && !timed.atlasRetainedForTesting
            && timed.elapsedForTesting == CSVLaunchDuration;
        [timed start];
        BOOL noReplay = !timed.timerIsValidForTesting;
        CSDockAssemblyView *cancelled = [[CSDockAssemblyView alloc]
            initWithFrame:NSMakeRect(0, 0, 128, 128) image:image atlas:atlas tile:nil];
        [cancelled start]; [cancelled cancel]; [cancelled cancel];
        BOOL switched = !cancelled.timerIsValidForTesting && !cancelled.atlasRetainedForTesting;
        CSDockAssemblyView *reduced = [[CSDockAssemblyView alloc]
            initWithFrame:NSMakeRect(0, 0, 128, 128) image:image atlas:atlas tile:nil];
        [reduced start]; [reduced handleReducedMotion:YES];
        BOOL reducedDone = !reduced.timerIsValidForTesting && !reduced.atlasRetainedForTesting
            && reduced.elapsedForTesting == CSVLaunchDuration;
        BOOL nilRejected = [[CSDockAssemblyView alloc] initWithFrame:NSZeroRect image:image atlas:nil tile:nil] == nil;
        NSDictionary *report = @{@"offscreenOnly":@YES, @"applicationActivated":@NO,
            @"assetsDecoded":@(assets), @"topDownAtlasMapping":@(mapping), @"monotonicFrameSkip":@(monotonic),
            @"systemReduceMotionRespected":@(respectsSystem), @"timerCompletedAfterStall":@(completed),
            @"completedDoesNotReplay":@(noReplay), @"switchCancelsAndReleasesAtlas":@(switched),
            @"reduceMotionFinishesAndReleasesAtlas":@(reducedDone), @"missingAtlasRejected":@(nilRejected)};
        NSData *json = [NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:nil];
        puts([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
        return (mapping && monotonic && respectsSystem && completed && noReplay && switched && reducedDone && nilRejected) ? 0 : 1;
    }
}
