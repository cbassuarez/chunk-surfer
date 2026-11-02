/* Synthetic ABI fixture. It never loads Steam, accesses the network or writes
 * an account. Independently compiled C declarations exercise Rust's FFI shape. */
#include <stdbool.h>
#include <stdint.h>
#include <string.h>
#ifndef MOCK_APP_ID
#define MOCK_APP_ID 123456
#endif
static bool unlocked=false;
static int stat=0, pending=0, mode=0, free_count=0, request_count=0, init_count=0, shutdown_count=0;
struct CallbackMsg { int32_t user; int32_t kind; uint8_t *data; int32_t bytes; };
struct Stored { uint64_t app; int32_t result; };
static struct Stored stored;
bool SteamAPI_Init(void){init_count++;return true;}
void SteamAPI_Shutdown(void){shutdown_count++;}
void SteamAPI_ManualDispatch_Init(void){}
int32_t SteamAPI_GetHSteamPipe(void){return 1;}
void SteamAPI_ManualDispatch_RunFrame(int32_t pipe){(void)pipe;}
bool SteamAPI_ManualDispatch_GetNextCallback(int32_t pipe,struct CallbackMsg *callback){
 (void)pipe;if(!pending)return false;pending=0;stored.app=MOCK_APP_ID;stored.result=mode==2?8:1;
 callback->user=1;callback->kind=1102;callback->data=(uint8_t*)&stored;callback->bytes=sizeof(stored);return true;
}
void SteamAPI_ManualDispatch_FreeLastCallback(int32_t pipe){(void)pipe;free_count++;}
#ifdef MOCK_LEGACY
void *SteamAPI_SteamUserStats_v012(void){return (void*)1;}
#else
void *SteamAPI_SteamUserStats_v013(void){return (void*)1;}
#endif
void *SteamAPI_SteamUtils_v010(void){return (void*)1;}
uint32_t SteamAPI_ISteamUtils_GetAppID(void *self){(void)self;return MOCK_APP_ID;}
bool SteamAPI_ISteamUserStats_RequestCurrentStats(void *self){(void)self;request_count++;return true;}
bool SteamAPI_ISteamUserStats_GetAchievementAndUnlockTime(void *self,const char *id,bool *achieved,uint32_t *time){
 (void)self;*achieved=strcmp(id,"ACH_FIRST_TAKE")==0&&unlocked;*time=*achieved?12345:0;return true;
}
bool SteamAPI_ISteamUserStats_SetAchievement(void *self,const char *id){(void)self;if(strcmp(id,"ACH_FIRST_TAKE")==0)unlocked=true;return true;}
bool SteamAPI_ISteamUserStats_GetStatInt32(void *self,const char *id,int32_t *value){(void)self;if(mode==5)return false;*value=strcmp(id,"STAT_TAKES_COMPLETED")==0?stat:0;return true;}
bool SteamAPI_ISteamUserStats_SetStatInt32(void *self,const char *id,int32_t value){(void)self;if(strcmp(id,"STAT_TAKES_COMPLETED")==0)stat=value;return true;}
bool SteamAPI_ISteamUserStats_StoreStats(void *self){(void)self;if(mode==1)return false;pending=1;return true;}
void *SteamAPI_SteamFriends_v017(void){return (void*)1;}
const char *SteamAPI_ISteamFriends_GetPersonaName(void *self){(void)self;return "Fixture User";}
void FixtureSetMode(int value){mode=value;}
void FixtureGrantCachedProgress(void){unlocked=true;stat=8;}
int FixtureRequests(void){return request_count;}
int FixtureFrees(void){return free_count;}
int FixtureInitializations(void){return init_count;}
int FixtureShutdowns(void){return shutdown_count;}
