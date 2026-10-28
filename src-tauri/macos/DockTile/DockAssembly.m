// The approved ear builds in place once when the native app starts. The closed
// app's Dock plug-in remains static; macOS retains ownership of launch bounce.
#import <AppKit/AppKit.h>
#include <math.h>
#include <stdint.h>

static const NSUInteger CSDockMaskSide = 256;
static const NSTimeInterval CSDockAssemblyDuration = 2.7;

typedef struct { double x, y; } CSPoint;
typedef struct { double distance, position; } CSStroke;

static const CSPoint CSHelix[] = {
    {.425,.86},{.50,.78},{.54,.68},{.62,.57},{.695,.445},{.735,.31},
    {.715,.215},{.665,.15},{.59,.10},{.52,.092},{.45,.135},{.395,.215},
    {.365,.31},{.333,.405}
};
static const CSPoint CSFold[] = {
    {.38,.42},{.47,.39},{.57,.42},{.616,.365},{.607,.29},{.568,.225},
    {.514,.20},{.458,.23},{.416,.29},{.395,.36}
};
static const CSPoint CSBowl[] = {
    {.38,.43},{.48,.47},{.573,.50},{.565,.57},{.50,.65},{.435,.70}
};
// The new opaque, lightless cavity resolves last. There is no separate figure.
static const CSPoint CSCavity[] = {
    {.32,.438},{.34,.413},{.375,.413},{.413,.444},{.444,.466},
    {.446,.682},{.325,.682}
};
static const CSPoint CSCavityRim[] = {
    {.333,.66},{.332,.48},{.36,.423},{.414,.46},{.44,.68}
};

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

static double CSArrival(double x, double y, NSUInteger pixelX, NSUInteger pixelY) {
    double grain=CSGrain((uint32_t)(pixelX/2),(uint32_t)(pixelY/2))*.095
        + CSGrain((uint32_t)pixelX,(uint32_t)pixelY)*.018;
    if (CSInside(x,y,CSCavity,sizeof(CSCavity)/sizeof(CSCavity[0]))) {
        CSStroke cavity=CSNearestStroke(x,y,CSCavityRim,sizeof(CSCavityRim)/sizeof(CSCavityRim[0]));
        return 2.10+cavity.position*.27+grain*.5;
    }
    CSStroke helix=CSNearestStroke(x,y,CSHelix,sizeof(CSHelix)/sizeof(CSHelix[0]));
    CSStroke fold=CSNearestStroke(x,y,CSFold,sizeof(CSFold)/sizeof(CSFold[0]));
    CSStroke bowl=CSNearestStroke(x,y,CSBowl,sizeof(CSBowl)/sizeof(CSBowl[0]));
    double lobeGrowth=.055+hypot((x-.415)*1.4,y-.858)*3.2;
    double rimGrowth=.21+helix.position*.80+pow(helix.distance/.045,1.3)*.25;
    double foldGrowth=.82+fold.position*.45+pow(fold.distance/.035,1.2)*.25;
    double bowlGrowth=1.48+bowl.position*.24+bowl.distance*1.8;
    return fmin(2.56,fmin(fmin(lobeGrowth,rimGrowth),fmin(foldGrowth,bowlGrowth))+grain);
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
