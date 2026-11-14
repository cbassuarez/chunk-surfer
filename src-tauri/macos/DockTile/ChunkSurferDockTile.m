// Runs in the Dock helper, including while the game is closed. It reads only
// the icon preference and bundled artwork; game saves and signed files stay put.
#import <AppKit/AppKit.h>
#import "DockIconPolicy.h"

@interface ChunkSurferDockTile : NSObject <NSDockTilePlugIn>
@property(nonatomic, weak) NSDockTile *tile;
@property(nonatomic) BOOL observing;
@end

@implementation ChunkSurferDockTile
- (void)refresh {
    NSDockTile *tile = self.tile;
    if (tile == nil) return;
    NSBundle *bundle = [NSBundle bundleForClass:self.class];
    NSImage *image = [bundle imageForResource:CSStoredEarIcon() ? @"Ear" : @"DockTile"];
    if (image == nil) image = [bundle imageForResource:@"DockTile"];
    if (image == nil) return;
    NSImageView *view = [[NSImageView alloc] initWithFrame:NSMakeRect(0, 0, tile.size.width, tile.size.height)];
    view.image = image;
    view.imageScaling = NSImageScaleProportionallyUpOrDown;
    view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    tile.contentView = view;
    [tile display];
}
- (void)choiceChanged:(NSNotification *)notification {
    (void)notification;
    if (NSThread.isMainThread) [self refresh];
    else { __weak ChunkSurferDockTile *weakSelf = self; dispatch_async(dispatch_get_main_queue(), ^{ [weakSelf refresh]; }); }
}
- (void)setDockTile:(NSDockTile *)dockTile {
    if (self.observing) {
        [NSDistributedNotificationCenter.defaultCenter removeObserver:self name:CSIconChoiceNotification object:nil];
        self.observing = NO;
    }
    self.tile = dockTile;
    if (dockTile == nil) return;
    [NSDistributedNotificationCenter.defaultCenter addObserver:self selector:@selector(choiceChanged:)
        name:CSIconChoiceNotification object:nil suspensionBehavior:NSNotificationSuspensionBehaviorDeliverImmediately];
    self.observing = YES;
    [self refresh];
}
- (void)dealloc { [NSDistributedNotificationCenter.defaultCenter removeObserver:self]; }
@end
