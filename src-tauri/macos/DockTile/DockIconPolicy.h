// Shared by the running app and the closed-app Dock helper. Preferences live
// outside signed bundles and outside any individual game/run save.
#import <Foundation/Foundation.h>

static NSString *const CSIconChoiceNotification = @"com.cbassuarez.chunksurfer.AppIconChoiceDidChange";
static CFStringRef const CSIconPreferenceDomain = CFSTR("com.cbassuarez.chunksurfer");
static CFStringRef const CSIconPreferenceKey = CFSTR("CSAppIconChoice");

static inline BOOL CSStoredEarIcon(void) {
    CFPreferencesSynchronize(CSIconPreferenceDomain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost);
    CFPropertyListRef value = CFPreferencesCopyValue(CSIconPreferenceKey, CSIconPreferenceDomain,
        kCFPreferencesCurrentUser, kCFPreferencesAnyHost);
    BOOL ear = value != NULL && CFGetTypeID(value) == CFStringGetTypeID()
        && CFEqual(value, CFSTR("ear"));
    if (value != NULL) CFRelease(value);
    return ear;
}

static inline void CSStoreEarIcon(BOOL ear) {
    CFPreferencesSetValue(CSIconPreferenceKey, ear ? CFSTR("ear") : CFSTR("van"),
        CSIconPreferenceDomain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost);
    CFPreferencesSynchronize(CSIconPreferenceDomain, kCFPreferencesCurrentUser, kCFPreferencesAnyHost);
}
