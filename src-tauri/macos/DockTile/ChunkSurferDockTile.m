// The Dock tile while Chunk Surfer is not running.
//
// The bundle and this plug-in use the same transparent ear. This plug-in
// keeps the closed-app tile static; the running app owns its one-shot
// assembly animation through src/dock_tile.rs.
//
// This code runs inside the Dock's own helper process
// (com.apple.dock.external.extra), not in the game. A plug-in that throws
// there crashes the helper on every login, so every step bails quietly.

#import <AppKit/AppKit.h>

@interface ChunkSurferDockTile : NSObject <NSDockTilePlugIn>
@end

@implementation ChunkSurferDockTile

- (void)setDockTile:(NSDockTile *)dockTile {
    // nil means the plug-in is being detached; the view goes with the tile.
    if (dockTile == nil) return;
    NSBundle *bundle = [NSBundle bundleForClass:[self class]];
    // DockTile.icns carries the approved ear at every supported Dock size.
    NSImage *image = [bundle imageForResource:@"DockTile"];
    if (image == nil) return;
    NSSize size = dockTile.size;
    NSImageView *view = [[NSImageView alloc] initWithFrame:NSMakeRect(0, 0, size.width, size.height)];
    view.image = image;
    view.imageScaling = NSImageScaleProportionallyUpOrDown;
    dockTile.contentView = view;
    [dockTile display];
}

@end
