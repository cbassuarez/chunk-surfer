// A finite native launch performance, rendered from the real Transit. No game
// renderer, WebView, audio, idle animation or background worker lives here.
#import <AppKit/AppKit.h>
#include <math.h>
#include <stdint.h>
#import "DockIconPolicy.h"
#include "VanLaunch.inc"

static void CSInstallStaticImage(NSDockTile *tile, NSImage *image) {
    if (tile == nil || image == nil) return;
    NSApplication.sharedApplication.applicationIconImage = image;
    NSImageView *view = [[NSImageView alloc] initWithFrame:NSMakeRect(0, 0, tile.size.width, tile.size.height)];
    view.image = image;
    view.imageScaling = NSImageScaleProportionallyUpOrDown;
    view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    tile.contentView = view;
    [tile display];
}

static NSUInteger CSLaunchFrame(NSTimeInterval elapsed) {
    double progress = fmax(0, fmin(1, elapsed / CSVLaunchDuration));
    return MIN(CSVLaunchFrameCount - 1, (NSUInteger)floor(progress * (CSVLaunchFrameCount - 1)));
}

static NSRect CSLaunchFrameRect(NSUInteger index) {
    index = MIN(index, CSVLaunchFrameCount - 1);
    // PNG rows are authored top down; NSImage source rectangles are bottom up.
    return NSMakeRect((index % CSVLaunchColumns) * CSVLaunchCellSize,
        (CSVLaunchRows - 1 - index / CSVLaunchColumns) * CSVLaunchCellSize,
        CSVLaunchCellSize, CSVLaunchCellSize);
}

@interface CSDockAssemblyView : NSView {
    NSImage *_image;
    NSImage *_atlas;
    __weak NSDockTile *_tile;
    NSTimer *_timer;
    id _displayObserver;
    NSTimeInterval _startedAt;
    NSTimeInterval _elapsed;
    BOOL _finished;
}
- (instancetype)initWithFrame:(NSRect)frame image:(NSImage *)image atlas:(NSImage *)atlas tile:(NSDockTile *)tile;
- (void)start;
- (void)finish;
- (void)cancel;
- (void)handleReducedMotion:(BOOL)reducedMotion;
#ifdef CS_DOCK_ASSEMBLY_TESTING
- (void)setElapsedForTesting:(NSTimeInterval)elapsed;
- (BOOL)timerIsValidForTesting;
- (BOOL)atlasRetainedForTesting;
- (NSTimeInterval)elapsedForTesting;
#endif
@end

@implementation CSDockAssemblyView
- (instancetype)initWithFrame:(NSRect)frame image:(NSImage *)image atlas:(NSImage *)atlas tile:(NSDockTile *)tile {
    self = [super initWithFrame:frame];
    if (self == nil || image == nil || atlas == nil) return nil;
    _image = image;
    _atlas = atlas;
    _atlas.size = NSMakeSize(CSVLaunchColumns * CSVLaunchCellSize, CSVLaunchRows * CSVLaunchCellSize);
    _tile = tile;
    self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    return self;
}
- (BOOL)isFlipped { return YES; }
- (void)start {
    if (_finished || _timer != nil) return;
    if (NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) { [self finish]; return; }
    _startedAt = NSProcessInfo.processInfo.systemUptime;
    __weak CSDockAssemblyView *weakSelf = self;
    _displayObserver = [NSWorkspace.sharedWorkspace.notificationCenter
        addObserverForName:NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification
        object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
            (void)note;
            [weakSelf handleReducedMotion:NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion];
        }];
    _timer = [NSTimer timerWithTimeInterval:1.0 / 24.0 repeats:YES block:^(NSTimer *timer) {
        CSDockAssemblyView *view = weakSelf;
        if (view == nil) { [timer invalidate]; return; }
        // Real elapsed time skips missed frames; loading cannot queue a burst.
        view->_elapsed = NSProcessInfo.processInfo.systemUptime - view->_startedAt;
        if (view->_elapsed >= CSVLaunchDuration || NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
            [view finish]; return;
        }
        view.needsDisplay = YES;
        [view->_tile display];
    }];
    [NSRunLoop.mainRunLoop addTimer:_timer forMode:NSRunLoopCommonModes];
    self.needsDisplay = YES;
    [_tile display];
}
- (void)stop {
    if (_finished) return;
    _finished = YES;
    _elapsed = CSVLaunchDuration;
    [_timer invalidate]; _timer = nil;
    if (_displayObserver != nil) {
        [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:_displayObserver];
        _displayObserver = nil;
    }
    // Release the decoded atlas. The final ICNS retains its size-specific art.
    _atlas = nil;
}
- (void)cancel { [self stop]; }
- (void)finish {
    if (_finished) return;
    [self stop];
    NSDockTile *tile = _tile;
    if (tile.contentView == self) CSInstallStaticImage(tile, _image);
}
- (void)handleReducedMotion:(BOOL)reducedMotion { if (reducedMotion) [self finish]; }
- (void)drawRect:(NSRect)dirtyRect {
    (void)dirtyRect;
    CGContextRef context = NSGraphicsContext.currentContext.CGContext;
    if (context != NULL) CGContextClearRect(context, NSRectToCGRect(self.bounds));
    if (_finished || _atlas == nil) {
        [_image drawInRect:self.bounds fromRect:NSZeroRect operation:NSCompositingOperationSourceOver
            fraction:1 respectFlipped:YES hints:nil];
    } else {
        [_atlas drawInRect:self.bounds fromRect:CSLaunchFrameRect(CSLaunchFrame(_elapsed))
            operation:NSCompositingOperationSourceOver fraction:1 respectFlipped:YES
            hints:@{NSImageHintInterpolation:@(NSImageInterpolationHigh)}];
    }
}
- (void)viewDidMoveToSuperview {
    [super viewDidMoveToSuperview];
    if (_timer != nil && _tile != nil && _tile.contentView != self) [self cancel];
}
- (void)dealloc {
    [_timer invalidate];
    if (_displayObserver != nil) [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:_displayObserver];
}
#ifdef CS_DOCK_ASSEMBLY_TESTING
- (void)setElapsedForTesting:(NSTimeInterval)elapsed { _elapsed = fmax(0, fmin(CSVLaunchDuration, elapsed)); }
- (BOOL)timerIsValidForTesting { return _timer.isValid; }
- (BOOL)atlasRetainedForTesting { return _atlas != nil; }
- (NSTimeInterval)elapsedForTesting { return _elapsed; }
#endif
@end

static NSImage *CSVanImage;
static NSImage *CSEarImage;
static BOOL CSDidInstall = NO;
static __weak CSDockAssemblyView *CSActiveAssembly;

static void CSSelectStaticIcon(BOOL ear) {
    [CSActiveAssembly cancel];
    CSActiveAssembly = nil;
    CSInstallStaticImage(NSApplication.sharedApplication.dockTile, ear ? CSEarImage : CSVanImage);
}

static void CSInstallDockAssembly(NSData *vanData, NSData *earData, NSData *atlasData) {
    NSDockTile *tile = NSApplication.sharedApplication.dockTile;
    if (CSDidInstall) { CSSelectStaticIcon(CSStoredEarIcon()); return; }
    CSVanImage = [[NSImage alloc] initWithData:vanData];
    CSEarImage = [[NSImage alloc] initWithData:earData];
    if (CSVanImage == nil || CSEarImage == nil || tile == nil) return;
    CSDidInstall = YES;
    BOOL ear = CSStoredEarIcon();
    if (ear || NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
        CSSelectStaticIcon(ear); return;
    }
    NSImage *atlas = [[NSImage alloc] initWithData:atlasData];
    if (atlas == nil) { CSSelectStaticIcon(NO); return; }
    NSApplication.sharedApplication.applicationIconImage = CSVanImage;
    CSDockAssemblyView *view = [[CSDockAssemblyView alloc]
        initWithFrame:NSMakeRect(0, 0, tile.size.width, tile.size.height)
        image:CSVanImage atlas:atlas tile:tile];
    if (view == nil) { CSSelectStaticIcon(NO); return; }
    CSActiveAssembly = view;
    tile.contentView = view;
    [view start];
}

void chunk_surfer_install_dock_assembly(const uint8_t *van, size_t vanLength,
        const uint8_t *ear, size_t earLength, const uint8_t *atlas, size_t atlasLength) {
    @autoreleasepool {
        if (van == NULL || vanLength == 0 || ear == NULL || earLength == 0 || atlas == NULL || atlasLength == 0) return;
        NSData *vanData = [NSData dataWithBytes:van length:vanLength];
        NSData *earData = [NSData dataWithBytes:ear length:earLength];
        NSData *atlasData = [NSData dataWithBytes:atlas length:atlasLength];
        if (NSThread.isMainThread) CSInstallDockAssembly(vanData, earData, atlasData);
        else dispatch_async(dispatch_get_main_queue(), ^{ CSInstallDockAssembly(vanData, earData, atlasData); });
    }
}

int32_t chunk_surfer_app_icon_choice(void) { @autoreleasepool { return CSStoredEarIcon() ? 1 : 0; } }

int32_t chunk_surfer_set_app_icon(int32_t choice) {
    if (choice != 0 && choice != 1) return 0;
    __block BOOL selected = NO;
    void (^select)(void) = ^{
        if (!CSDidInstall || CSVanImage == nil || CSEarImage == nil) return;
        BOOL ear = choice == 1;
        CSSelectStaticIcon(ear);
        CSStoreEarIcon(ear);
        [NSDistributedNotificationCenter.defaultCenter postNotificationName:CSIconChoiceNotification
            object:nil userInfo:nil deliverImmediately:YES];
        selected = YES;
    };
    @autoreleasepool {
        if (NSThread.isMainThread) select(); else dispatch_sync(dispatch_get_main_queue(), select);
    }
    return selected ? 1 : 0;
}
