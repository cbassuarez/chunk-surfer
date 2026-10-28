// Standalone AppKit renderer/timer verification. Compile with clang -fobjc-arc -framework AppKit.
// It creates no game/WebKit session and does not alter system preferences.
#define CS_DOCK_ASSEMBLY_TESTING 1
#import "../../../src-tauri/macos/DockTile/DockAssembly.m"

static void WritePNG(NSView *view,NSString *path) {
    NSBitmapImageRep *bitmap=[view bitmapImageRepForCachingDisplayInRect:view.bounds];
    [view cacheDisplayInRect:view.bounds toBitmapImageRep:bitmap];
    NSData *png=[bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    NSCAssert([png writeToFile:path atomically:YES],@"PNG capture failed");
}

int main(int argc,const char **argv) {
    @autoreleasepool {
        NSApplication *app=NSApplication.sharedApplication;
        [app setActivationPolicy:NSApplicationActivationPolicyAccessory];
        if(argc!=3){fputs("usage: dock-assembly-native ICNS OUTPUT_DIRECTORY\n",stderr);return 2;}
        NSString *root=[NSString stringWithUTF8String:argv[2]];
        [NSFileManager.defaultManager createDirectoryAtPath:root withIntermediateDirectories:YES attributes:nil error:nil];
        NSImage *image=[[NSImage alloc]initWithContentsOfFile:[NSString stringWithUTF8String:argv[1]]];
        NSCAssert(image!=nil,@"ICNS decode failed");
        NSWindow *window=[[NSWindow alloc]initWithContentRect:NSMakeRect(0,0,512,512) styleMask:NSWindowStyleMaskTitled backing:NSBackingStoreBuffered defer:NO];
        window.releasedWhenClosed=NO;
        CSDockAssemblyView *view=[[CSDockAssemblyView alloc]initWithFrame:NSMakeRect(0,0,512,512) image:image tile:nil];
        window.contentView=view;
        NSArray<NSNumber *> *times=@[@0,@.35,@.70,@1.2,@1.6,@2.2,@2.5,@2.7];
        NSMutableArray *captures=[NSMutableArray array];
        for(NSNumber *time in times){
            [view setElapsedForTesting:time.doubleValue];
            NSString *name=[NSString stringWithFormat:@"native-%.2f.png",time.doubleValue];
            WritePNG(view,[root stringByAppendingPathComponent:name]);
            [captures addObject:@{@"seconds":time,@"image":name}];
        }
        NSImageView *reference=[[NSImageView alloc]initWithFrame:NSMakeRect(0,0,512,512)];
        reference.image=image;reference.imageScaling=NSImageScaleProportionallyUpOrDown;
        window.contentView=reference;WritePNG(reference,[root stringByAppendingPathComponent:@"native-reference.png"]);
        CSDockAssemblyView *timed=[[CSDockAssemblyView alloc]initWithFrame:NSMakeRect(0,0,128,128) image:image tile:nil];
        [timed start];
        BOOL started=timed.timerIsValidForTesting;
        [NSThread sleepForTimeInterval:3.05];
        [NSRunLoop.mainRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.08]];
        BOOL elapsedFinished=!timed.timerIsValidForTesting && timed.elapsedForTesting==CSDockAssemblyDuration;
        [timed start];
        BOOL noRestart=!timed.timerIsValidForTesting;
        CSDockAssemblyView *reduced=[[CSDockAssemblyView alloc]initWithFrame:NSMakeRect(0,0,128,128) image:image tile:nil];
        [reduced start];[reduced handleReducedMotion:YES];
        BOOL reduceFinished=!reduced.timerIsValidForTesting&&reduced.elapsedForTesting==CSDockAssemblyDuration;
        NSDictionary *receipt=@{@"nativeAppKit":@YES,@"gameOrProfileUsed":@NO,@"captures":captures,@"timerStarted":@(started),@"elapsedStallFinished":@(elapsedFinished),@"completedDoesNotRestart":@(noRestart),@"reduceMotionFinishes":@(reduceFinished),@"lobeArrival":@([view arrivalAtX:.415 y:.85]),@"cavityArrival":@([view arrivalAtX:.375 y:.55])};
        NSData *json=[NSJSONSerialization dataWithJSONObject:receipt options:NSJSONWritingPrettyPrinted error:nil];
        [json writeToFile:[root stringByAppendingPathComponent:@"native-check.json"]atomically:YES];
        puts([[NSString alloc]initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
        [window close];
        return (elapsedFinished&&noRestart&&reduceFinished)?0:1;
    }
}
