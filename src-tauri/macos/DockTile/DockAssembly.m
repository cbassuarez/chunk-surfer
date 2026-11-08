// The approved van builds in place once when the native app starts, out of
// the same geometry as the static icon (scripts/generate-van-icon-art.mjs
// writes DockAssemblyGeometry.inc from assets/brand/van-icon-geometry.json).
// The closed app's Dock plug-in remains static; macOS retains ownership of
// launch bounce. The lamps are the payoff: they resolve last, then flash once
// with the game's own lamp cadence.
#import <AppKit/AppKit.h>
#include <math.h>
#include <stdint.h>

static const NSUInteger CSDockMaskSide = 256;
static const NSTimeInterval CSDockAssemblyDuration = 2.7;
// The lamp flash window, in the game's own cue timing: the dead door's quiet
// window is 1.8s; the scare rush is .16s; the lamps strike at 2.15 and the
// flash is gone before the assembly hands the tile back at 2.7.
static const NSTimeInterval CSLampFlashStart = 2.15;
static const NSTimeInterval CSLampFlashSeconds = 0.60;

typedef struct { double x, y; } CSPoint;
typedef struct { double distance, position; } CSStroke;

#import "DockAssemblyGeometry.inc"

static double CSClamp(double value, double low, double high) {
    return fmax(low, fmin(high, value));
}

static BOOL CSInside(double x, double y, const CSPoint *points, NSUInteger count) {
    BOOL inside = NO;
    for (NSUInteger i=0,j=count-1; i<count; j=i++) {
        CSPoint a=points[i], b=points[j];
        if ((a.y>y)!=(b.y>y) && x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)
            inside = !inside;
    }
    return inside;
}

static CSStroke CSNearestStroke(double x, double y, const CSPoint *points, NSUInteger count) {
    double total=0, run=0;
    CSStroke result = { INFINITY, 0 };
    for (NSUInteger i=0;i+1<count;i++)
        total += hypot(points[i+1].x-points[i].x, points[i+1].y-points[i].y);
    for (NSUInteger i=0;i+1<count;i++) {
        CSPoint a=points[i], b=points[i+1];
        double dx=b.x-a.x, dy=b.y-a.y, length=hypot(dx,dy);
        double q=CSClamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
        double distance=hypot(x-a.x-q*dx,y-a.y-q*dy);
        if (distance<result.distance) {
            result.distance=distance;
            result.position=(run+q*length)/total;
        }
        run += length;
    }
    return result;
}

static double CSGrain(uint32_t x, uint32_t y) {
    uint32_t n=(x+113u)*374761393u ^ (y+97u)*668265263u;
    n=(n^(n>>13))*1274126177u;
    return (double)(n^(n>>16))/4294967295.0;
}

// One flash, the game's own lamp cue: up over the first half of the window,
// gone by the end of it. Peak 0.75 at the midpoint, never clipped.
static void CSFillLampRect(CGContextRef ctx, const CSPoint *lamp, NSRect bounds, double alpha) {
    double minX=1,minY=1,maxX=0,maxY=0;
    for (NSUInteger i=0;i<4;i++) {
        minX=fmin(minX,lamp[i].x); maxX=fmax(maxX,lamp[i].x);
        minY=fmin(minY,lamp[i].y); maxY=fmax(maxY,lamp[i].y);
    }
    CGContextSetFillColorWithColor(ctx, [NSColor colorWithSRGBRed:.847 green:.263 blue:.184 alpha:alpha].CGColor);
    CGContextFillRect(ctx, CGRectMake(minX*bounds.size.width, minY*bounds.size.height,
        (maxX-minX)*bounds.size.width, (maxY-minY)*bounds.size.height));
}

static double CSLampFlashAlpha(NSTimeInterval elapsed) {
    double u = (elapsed - CSLampFlashStart) / CSLampFlashSeconds;
    if (u < 0 || u > 1) return 0;
    return .75 * sin(M_PI * u);
}

static double CSArrival(double x, double y, NSUInteger pixelX, NSUInteger pixelY) {
    double grain=CSGrain((uint32_t)(pixelX/2),(uint32_t)(pixelY/2))*.095
        + CSGrain((uint32_t)pixelX,(uint32_t)pixelY)*.018;
    // The lamps resolve last: the body is assembled and the doors are drawn
    // before the red comes up. Their flash rides on top in drawRect.
    if (CSInside(x,y,CSVanLampL,sizeof(CSVanLampL)/sizeof(CSVanLampL[0]))
        return 1.78 + CSNearestStroke(x,y,CSVanLampL,sizeof(CSVanLampL)/sizeof(CSVanLampL[0])).position*.18 + grain*.5;
    if (CSInside(x,y,CSVanLampR,sizeof(CSVanLampR)/sizeof(CSVanLampR[0])))
        return 1.78 + CSNearestStroke(x,y,CSVanLampR,sizeof(CSVanLampR)/sizeof(CSVanLampR[0])).position*.18 + grain*.5;
    CSStroke body=CSNearestStroke(x,y,CSVanBody,sizeof(CSVanBody)/sizeof(CSVanBody[0]));
    CSStroke seam=CSNearestStroke(x,y,CSVanSeam,sizeof(CSVanSeam)/sizeof(CSVanSeam[0]));
    CSStroke bumper=CSNearestStroke(x,y,CSVanBumper,sizeof(CSVanBumper)/sizeof(CSVanBumper[0]));
    double bodyGrowth=.05+hypot((x-.5)*1.35,(y-.53)*1.7)*2.7;
    double rimGrowth=.22+body.position*.78+pow(body.distance/.05,1.3)*.25;
    double seamGrowth=1.02+seam.position*.26;
    double bumperGrowth=1.28+bumper.position*.16;
    return fmin(2.56,fmin(fmin(bodyGrowth,rimGrowth),fmin(seamGrowth,bumperGrowth))+grain);
}

static void CSInstallStaticImage(NSDockTile *tile, NSImage *image) {
    if (tile==nil || image==nil) return;
    NSImageView *view=[[NSImageView alloc] initWithFrame:NSMakeRect(0,0,tile.size.width,tile.size.height)];
    view.image=image;
    view.imageScaling=NSImageScaleProportionallyUpOrDown;
    view.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;
    tile.contentView=view;
    [tile display];
}

@interface CSDockAssemblyView : NSView {
    NSImage *_image;
    __weak NSDockTile *_tile;
    NSTimer *_timer;
    id _displayObserver;
    NSMutableData *_arrivalStorage;
    NSMutableData *_maskStorage;
    NSTimeInterval _startedAt;
    NSTimeInterval _elapsed;
    BOOL _finished;
}
- (instancetype)initWithFrame:(NSRect)frame image:(NSImage *)image tile:(NSDockTile *)tile;
- (void)start;
- (void)finish;
- (void)handleReducedMotion:(BOOL)reducedMotion;
#ifdef CS_DOCK_ASSEMBLY_TESTING
- (void)setElapsedForTesting:(NSTimeInterval)elapsed;
- (BOOL)timerIsValidForTesting;
- (NSTimeInterval)elapsedForTesting;
- (double)arrivalAtX:(double)x y:(double)y;
#endif
@end

@implementation CSDockAssemblyView

- (instancetype)initWithFrame:(NSRect)frame image:(NSImage *)image tile:(NSDockTile *)tile {
    self=[super initWithFrame:frame];
    if (self==nil) return nil;
    _image=image;
    _tile=tile;
    self.autoresizingMask=NSViewWidthSizable|NSViewHeightSizable;
    _arrivalStorage=[NSMutableData dataWithLength:CSDockMaskSide*CSDockMaskSide*sizeof(float)];
    _maskStorage=[NSMutableData dataWithLength:CSDockMaskSide*CSDockMaskSide];
    if (_arrivalStorage==nil || _maskStorage==nil) return nil;
    float *arrival=(float *)_arrivalStorage.mutableBytes;
    for (NSUInteger y=0;y<CSDockMaskSide;y++) for (NSUInteger x=0;x<CSDockMaskSide;x++)
        arrival[y*CSDockMaskSide+x]=(float)CSArrival((x+.5)/CSDockMaskSide,(y+.5)/CSDockMaskSide,x,y);
    return self;
}

- (BOOL)isFlipped { return YES; }

- (void)start {
    if (_finished || _timer!=nil) return;
    if (NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
        [self finish];
        return;
    }
    _startedAt=NSProcessInfo.processInfo.systemUptime;
    __weak CSDockAssemblyView *weakSelf=self;
    _displayObserver=[NSWorkspace.sharedWorkspace.notificationCenter
        addObserverForName:NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification
        object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) {
            (void)note;
            [weakSelf handleReducedMotion:NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion];
        }];
    _timer=[NSTimer timerWithTimeInterval:1.0/30.0 repeats:YES block:^(NSTimer *timer) {
        CSDockAssemblyView *view=weakSelf;
        if (view==nil) { [timer invalidate]; return; }
        // A delayed callback goes straight to the current phase; missed frames
        // are never replayed in a catch-up burst.
        view->_elapsed=NSProcessInfo.processInfo.systemUptime-view->_startedAt;
        if (view->_elapsed>=CSDockAssemblyDuration || NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
            [view finish];
            return;
        }
        view.needsDisplay=YES;
        [view->_tile display];
    }];
    [NSRunLoop.mainRunLoop addTimer:_timer forMode:NSRunLoopCommonModes];
    self.needsDisplay=YES;
    [_tile display];
}

- (void)handleReducedMotion:(BOOL)reducedMotion {
    if (reducedMotion) [self finish];
}

- (void)finish {
    if (_finished) return;
    _finished=YES;
    _elapsed=CSDockAssemblyDuration;
    [_timer invalidate]; _timer=nil;
    if (_displayObserver!=nil) {
        [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:_displayObserver];
        _displayObserver=nil;
    }
    // Discard construction buffers and use the original, size-selected ICNS
    // image for the final tile. No mask, resampled frame or idle timer remains.
    _arrivalStorage=nil;
    _maskStorage=nil;
    self.needsDisplay=YES;
    NSDockTile *tile=_tile;
    if (tile.contentView==self) CSInstallStaticImage(tile,_image);
}

- (void)drawRect:(NSRect)dirtyRect {
    (void)dirtyRect;
    // The view is transparent. In particular, the first empty construction
    // frame must clear the prelaunch picture instead of painting over it.
    CGContextRef drawingContext=NSGraphicsContext.currentContext.CGContext;
    if (drawingContext!=NULL) CGContextClearRect(drawingContext,NSRectToCGRect(self.bounds));
    if (_finished || _elapsed>=CSDockAssemblyDuration) {
        [_image drawInRect:self.bounds fromRect:NSZeroRect operation:NSCompositingOperationSourceOver
            fraction:1 respectFlipped:YES hints:nil];
        return;
    }
    float *arrival=(float *)_arrivalStorage.bytes;
    uint8_t *mask=(uint8_t *)_maskStorage.mutableBytes;
    for (NSUInteger i=0;i<CSDockMaskSide*CSDockMaskSide;i++)
        mask[i]=arrival[i]<=_elapsed ? 0 : 255;
    CGDataProviderRef provider=CGDataProviderCreateWithCFData((__bridge CFDataRef)_maskStorage);
    CGImageRef reveal=CGImageMaskCreate(CSDockMaskSide,CSDockMaskSide,8,8,CSDockMaskSide,provider,NULL,false);
    CGDataProviderRelease(provider);
    NSRect proposed=self.bounds;
    CGImageRef source=[_image CGImageForProposedRect:&proposed context:nil hints:nil];
    CGImageRef partial=(source!=NULL && reveal!=NULL) ? CGImageCreateWithMask(source,reveal) : NULL;
    if (reveal!=NULL) CGImageRelease(reveal);
    if (partial==NULL) { [self finish]; return; }
    NSImage *frame=[[NSImage alloc] initWithCGImage:partial size:self.bounds.size];
    [frame drawInRect:self.bounds fromRect:NSZeroRect operation:NSCompositingOperationSourceOver
        fraction:1 respectFlipped:YES hints:@{NSImageHintInterpolation:@(NSImageInterpolationNone)}];
    CGImageRelease(partial);
    // The lamp cue: a single flash over the resolved red, the game's own
    // lamp cadence, gone before the assembly hands the tile back.
    double flash=CSLampFlashAlpha(_elapsed);
    if (flash>0) {
        CSFillLampRect(drawingContext,CSVanLampL,self.bounds,flash);
        CSFillLampRect(drawingContext,CSVanLampR,self.bounds,flash);
    }
}

- (void)dealloc {
    [_timer invalidate];
    if (_displayObserver!=nil)
        [NSWorkspace.sharedWorkspace.notificationCenter removeObserver:_displayObserver];
}

#ifdef CS_DOCK_ASSEMBLY_TESTING
- (void)setElapsedForTesting:(NSTimeInterval)elapsed {
    _elapsed=CSClamp(elapsed,0,CSDockAssemblyDuration);
    self.needsDisplay=YES;
}
- (BOOL)timerIsValidForTesting { return _timer.isValid; }
- (NSTimeInterval)elapsedForTesting { return _elapsed; }
- (double)arrivalAtX:(double)x y:(double)y {
    NSUInteger px=(NSUInteger)CSClamp(floor(x*CSDockMaskSide),0,CSDockMaskSide-1);
    NSUInteger py=(NSUInteger)CSClamp(floor(y*CSDockMaskSide),0,CSDockMaskSide-1);
    return CSArrival((px+.5)/CSDockMaskSide,(py+.5)/CSDockMaskSide,px,py);
}
#endif
@end

static void CSInstallDockAssembly(NSData *data) {
    static BOOL didInstall=NO;
    NSDockTile *tile=NSApplication.sharedApplication.dockTile;
    if (didInstall) {
        // A duplicate setup call completes any existing build; it cannot
        // leave an old timer running or restart the launch sequence.
        NSView *current=tile.contentView;
        if ([current isKindOfClass:CSDockAssemblyView.class]) [(CSDockAssemblyView *)current finish];
        return;
    }
    NSImage *image=[[NSImage alloc] initWithData:data];
    if (image==nil || tile==nil) return;
    didInstall=YES;
    NSView *old=tile.contentView;
    if ([old isKindOfClass:CSDockAssemblyView.class]) [(CSDockAssemblyView *)old finish];
    if (NSWorkspace.sharedWorkspace.accessibilityDisplayShouldReduceMotion) {
        CSInstallStaticImage(tile,image);
        return;
    }
    CSDockAssemblyView *view=[[CSDockAssemblyView alloc]
        initWithFrame:NSMakeRect(0,0,tile.size.width,tile.size.height) image:image tile:tile];
    if (view==nil) { CSInstallStaticImage(tile,image); return; }
    tile.contentView=view;
    [view start];
}

void chunk_surfer_install_dock_assembly(const uint8_t *bytes, size_t length) {
    @autoreleasepool {
        if (bytes==NULL || length==0) return;
        NSData *data=[NSData dataWithBytes:bytes length:length];
        if (NSThread.isMainThread) CSInstallDockAssembly(data);
        else dispatch_async(dispatch_get_main_queue(), ^{ CSInstallDockAssembly(data); });
    }
}
