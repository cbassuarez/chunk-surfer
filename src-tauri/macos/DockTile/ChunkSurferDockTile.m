// The Dock tile while Chunk Surfer is not running.
//
// macOS 26 shrinks any bundle icon that is not the squircle and seats it on a
// grey plate, so icon.icns stays the squircle tile (Finder, Spotlight and the
// app switcher read it). The Dock tile is the one place an app may still draw
// its own shape: this plug-in puts the cut-out ear there, and
// src/dock_tile.rs does the same while the app runs.
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
    // DockTile.icns carries one drawing per size, so the print stays a print at
    // every Dock size instead of being scaled down from 1024.
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
