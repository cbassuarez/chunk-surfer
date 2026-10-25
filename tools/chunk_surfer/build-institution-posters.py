#!/usr/bin/env python3
"""Ellery's own print studio: pinned URW outlines, authored compositions,
independent ink coverage and the ordinary metre-scaled paper finish.

No lighting, legibility halo, HUD, generative image or substituted system font.
"""
from pathlib import Path
import sys,json,math,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(HERE/'lettering'))
from rasterize import font_for,seeded
from finish import finish_surface

config=json.loads(Path(sys.argv[1]).read_text())
OUT=Path(sys.argv[2]);OUT.mkdir(parents=True,exist_ok=True)
SERIF='NimbusRoman-Regular.otf';BOLD='NimbusRoman-Bold.otf';ITALIC='NimbusRoman-Italic.otf'
SANS='NimbusSans-Bold.otf';NARROW='NimbusSansNarrow-Bold.otf';MONO='NimbusMonoPS-Regular.otf'
CREAM=(224,215,190);INK=(29,32,30);OX=(116,35,38);BLUE=(27,53,85);SAGE=(67,85,64);YELLOW=(210,162,61)
font_proof={}

class Sheet:
 def __init__(self,design):
  self.d=design;self.w=design.get('rasterWidthPx',1280 if design['widthM']>design['heightM'] else 768);self.h=round(self.w*design['heightM']/design['widthM']);self.layers=[];self.regions=[];self.ground=CREAM
 def mask(self):return Image.new('L',(self.w,self.h))
 def add(self,mask,ink):self.layers.append((mask,ink))
 def rect(self,box,ink):
  m=self.mask();ImageDraw.Draw(m).rectangle(tuple(round(v*(self.w if i%2==0 else self.h)) for i,v in enumerate(box)),fill=255);self.add(m,ink)
 def line(self,points,ink,width=.003):
  m=self.mask();ImageDraw.Draw(m).line([(round(x*self.w),round(y*self.h)) for x,y in points],fill=255,width=max(1,round(width*self.w)),joint='curve');self.add(m,ink)
 def polygon(self,points,ink):
  m=self.mask();ImageDraw.Draw(m).polygon([(round(x*self.w),round(y*self.h)) for x,y in points],fill=255);self.add(m,ink)
 def ellipse(self,box,ink,width=None):
  m=self.mask();dr=ImageDraw.Draw(m);b=tuple(round(v*(self.w if i%2==0 else self.h)) for i,v in enumerate(box));dr.ellipse(b,fill=255 if width is None else None,outline=255 if width else None,width=max(1,round((width or .001)*self.w)));self.add(m,ink)
 def arc(self,box,start,end,ink,width=.008):
  m=self.mask();ImageDraw.Draw(m).arc(tuple(round(v*(self.w if i%2==0 else self.h)) for i,v in enumerate(box)),start,end,fill=255,width=max(1,round(width*self.w)));self.add(m,ink)
 def text(self,copy,box,size=.07,font=SANS,ink=INK,align='left',tracking=0):
  # size is the requested printed capital height relative to sheet width.
  file,sha=font_for({'font':font});font_proof[font]=sha
  x0,y0,x1,y1=box;limitW=(x1-x0)*self.w;limitH=(y1-y0)*self.h
  px=max(6,round(size*self.w/.72));f=ImageFont.truetype(str(file),px)
  def metrics(f):
   bounds=f.getbbox(copy,anchor='lt');return (f.getlength(copy)+max(0,len(copy)-1)*tracking*self.w,bounds[3]-bounds[1])
  while metrics(f)[0]>limitW or metrics(f)[1]>limitH:
   px-=1
   if px<5:raise ValueError('Unprintable '+copy)
   f=ImageFont.truetype(str(file),px)
  tw,th=metrics(f);x=x0*self.w+(limitW-tw)/2 if align=='center' else x1*self.w-tw if align=='right' else x0*self.w
  y=y0*self.h+(limitH-th)/2
  m=self.mask();draw=ImageDraw.Draw(m)
  # A single baseline and exact pair kerning; no fake stretched type.
  for i,c in enumerate(copy):
   at=x+f.getlength(copy[:i])+i*tracking*self.w
   draw.text((at,y),c,font=f,anchor='lt',fill=255)
  self.add(m,ink);self.regions.append({'copy':copy,'font':font,'fontSha256':sha,'box':box,'capHeightM':(-f.getbbox('H',anchor='ls')[1])*self.d['widthM']/self.w})
 def imprint(self,light=False):
  ink=CREAM if light else INK
  self.text('ELLERY',(.07,.025,.56,.055),.024,BOLD,ink)
  self.text('MUNICIPAL SCHOOL OF MUSIC',(.07,.057,.94,.082),.011,SANS,ink,tracking=.001)
  self.line([(.07,.095),(.93,.095)],ink,.002)
 def footer(self,copy='PUBLIC CONCERTS  ·  BOX OFFICE',light=False):
  ink=CREAM if light else INK
  self.line([(.07,.91),(.93,.91)],ink,.002)
  self.text(copy,(.07,.925,.93,.951),.012,SANS,ink)
  self.text('ELLERY / MUSIC FOR EVERYONE',(.07,.963,.93,.98),.009,MONO,ink)

def season(s):
 s.imprint();s.rect((.045,.14,.305,.84),OX)
 # A lithographic rhythm of concert-hall portals, integrated with the title.
 for i in range(5):
  x=.068+i*.042;s.arc((x,.19,x+.115,.50),180,360,CREAM,.006);s.line([(x,.346),(x,.77)],CREAM,.006)
 s.text('MUSIC',(.34,.145,.95,.295),.135,BOLD)
 s.text('FOR THE CITY',(.34,.30,.95,.39),.055,SANS,OX)
 s.text('THE SEASON PROGRAMME',(.345,.43,.94,.48),.022,SANS)
 entries=[('ORCHESTRAL','The municipal orchestra'),('CHAMBER','Small groups, close listening'),('VOICES','Choirs and visiting singers'),('SOLO','The recital series'),('LATE MUSIC','New work after hours')]
 for i,(title,small) in enumerate(entries):
  y=.515+i*.061;s.text(title,(.345,y,.595,y+.032),.018,SANS);s.text(small,(.61,y,.94,y+.032),.014,ITALIC);s.line([(.345,y+.044),(.94,y+.044)],OX,.0012)
 s.text('WINTER / SPRING',(.075,.787,.28,.827),.015,SANS,CREAM,align='center')
 # Existing fiction: this was the season that never opened. Real red pencil,
 # two strokes, not an added explanatory label or readable quest instruction.
 s.line([(.335,.455),(.936,.470)],OX,.002);s.line([(.345,.474),(.922,.453)],OX,.0013)
 s.footer('THE CONCERT HALL  ·  RECITAL ROOM  ·  COLLEGIATE CHAPEL')

def winter(s):
 s.ground=(219,224,215);s.imprint();s.rect((.07,.30,.93,.78),BLUE)
 for i in range(7):
  x=.10+i*.115;s.rect((x,.365,x+.07,.72),CREAM);s.ellipse((x,.32,x+.07,.405),CREAM)
 s.rect((.39,.30,.46,.78),YELLOW);s.ellipse((.33,.415,.73,.70),s.ground);s.ellipse((.405,.46,.655,.635),BLUE)
 s.text('WINTER',(.064,.115,.94,.205),.125,SANS,BLUE)
 s.text('CONCERTS',(.064,.205,.94,.29),.095,NARROW,BLUE)
 s.text('ORCHESTRA · CHAMBER MUSIC · CHOIRS',(.07,.798,.93,.83),.017,SANS,BLUE)
 s.text('A season at Ellery',(.07,.843,.93,.88),.025,ITALIC,BLUE);s.footer()

def winter_programme(s):
 s.ground=(219,224,215);s.imprint();s.rect((.07,.145,.39,.86),BLUE)
 for i in range(5):
  x=.095+i*.055;s.rect((x,.29,x+.027,.785),CREAM);s.ellipse((x,.25,x+.027,.32),CREAM)
 s.ellipse((.13,.42,.34,.72),YELLOW);s.ellipse((.17,.465,.30,.675),BLUE)
 s.text('WINTER',(.43,.14,.94,.28),.11,SANS,BLUE)
 s.text('CONCERTS',(.43,.28,.94,.38),.08,NARROW,BLUE)
 s.text('THE MUNICIPAL SERIES',(.43,.44,.94,.485),.023,SANS,BLUE)
 for i,(title,small) in enumerate([('ORCHESTRA','Sundays in the concert hall'),('RECITALS','Soloists of the school'),('CHAMBER MUSIC','Thursdays at seven'),('CHOIRS','Voices in the chapel')]):
  y=.54+i*.077;s.text(title,(.43,y,.94,y+.031),.018,SANS,BLUE);s.text(small,(.43,y+.033,.94,y+.062),.016,ITALIC,BLUE)
 s.footer('THE WINTER PROGRAMME  ·  ELLERY MUNICIPAL SCHOOL OF MUSIC')

def chamber(s):
 s.ground=(205,212,183);s.imprint()
 s.text('IN',(.07,.13,.93,.25),.17,BOLD,SAGE)
 s.text('COMPANY',(.07,.25,.94,.34),.085,BOLD,SAGE)
 # Four distinct voices: interlocking open frames, a shared negative centre.
 for x,y,w,h,col in[(.13,.395,.37,.24,SAGE),(.43,.48,.39,.24,OX),(.20,.56,.36,.22,BLUE),(.48,.36,.32,.25,INK)]:
  s.line([(x,y+h),(x,y),(x+w,y),(x+w,y+h)],col,.014)
 s.text('CHAMBER MUSIC',(.07,.785,.93,.823),.03,SANS,SAGE)
 s.text('String players & friends',(.07,.834,.93,.87),.027,ITALIC)
 s.footer('THURSDAYS AT SEVEN  ·  RECITAL ROOM')

def piano(s):
 s.ground=(227,202,134);s.imprint();s.text('ONE',(.07,.13,.93,.27),.20,SANS)
 s.text('PIANO',(.07,.265,.93,.36),.125,SANS)
 # A single instrument takes possession of the lower page; retained paper
 # between keys is deliberate negative space, not a piano illustration stamp.
 s.ellipse((.21,.40,.88,.855),OX)
 for i in range(7):s.rect((.07+i*.095,.43,.153+i*.095,.79),CREAM)
 for i in[0,1,3,4,5]:s.rect((.13+i*.095,.43,.18+i*.095,.65),INK)
 s.text('THE SOLO RECITALS',(.07,.808,.93,.845),.026,SANS)
 s.text('An evening in the recital room',(.07,.853,.93,.885),.023,ITALIC)
 s.footer('SELECTED SUNDAYS  ·  SEVEN O’CLOCK')

def visiting(s):
 s.ground=BLUE;s.imprint(True)
 s.text('OTHER',(.07,.12,.93,.23),.142,SANS,CREAM)
 s.text('VOICES',(.07,.23,.93,.34),.142,SANS,CREAM)
 # Offset concentric apertures evoke sound travelling between institutions.
 for k in range(6):
  inset=k*.028;s.arc((-.30+inset,.385+inset,.70-inset,1.07-inset),270,88,CREAM,.008)
  s.arc((.34+inset,.30+inset,1.24-inset,.93-inset),88,270,YELLOW,.008)
 s.rect((0,.75,1,1),BLUE)
 s.text('VISITING ENSEMBLES',(.07,.756,.93,.802),.029,SANS,CREAM)
 s.text('New and remembered music',(.07,.816,.93,.85),.025,ITALIC,CREAM)
 s.text('THE CONCERT HALL',(.07,.855,.93,.887),.018,SANS,CREAM);s.footer(light=True)

def chapel(s):
 s.ground=(221,216,199);s.imprint();s.text('SOUND',(.07,.13,.93,.235),.14,BOLD,BLUE)
 s.text('& STONE',(.07,.235,.93,.33),.11,BOLD,BLUE)
 # Organ pipe groups and a masonry vault share their vertical rhythm.
 for i in range(11):
  x=.115+i*.071;height=.17+.18*(1-abs(i-5)/5);s.rect((x,.74-height,x+.039,.74),BLUE);s.ellipse((x,.73-height,x+.039,.755-height),BLUE)
 for k in range(3):s.arc((.09+k*.045,.345+k*.032,.91-k*.045,.89-k*.025),180,360,OX,.005)
 s.line([(.09,.612),(.09,.77),(.91,.77),(.91,.612)],OX,.005)
 s.text('ORGAN · CHOIR · EVENING MUSIC',(.07,.798,.93,.836),.023,SANS,BLUE)
 s.text('Ellery Collegiate Chapel',(.07,.846,.93,.884),.027,ITALIC,BLUE)
 s.footer('SATURDAYS  ·  DOORS AT SIX')

def students(s):
 s.ground=(216,222,203);s.imprint()
 s.rect((.07,.13,.93,.37),(173,194,175));s.text('PLAY',(.10,.14,.90,.25),.15,SANS)
 s.text('TOGETHER',(.10,.255,.90,.355),.10,NARROW)
 # Student print-room circles overprint a rough staff; this is music society
 # publicity, not the pristine house-brand concert-series artwork.
 for i in range(5):s.line([(.07,.46+i*.025),(.93,.46+i*.025)],INK,.0017)
 for i in range(3):
  x=.12+i*.25;s.ellipse((x,.405,x+.23,.57),[OX,SAGE,BLUE][i]);s.line([(x+.20,.49),(x+.20,.345)],INK,.008)
 s.text('ROOM FOR ONE MORE',(.07,.61,.93,.655),.035,SANS,OX)
 s.text('STUDENT ENSEMBLES',(.07,.675,.93,.715),.03,SANS)
 s.text('STRINGS · WIND · BRASS',(.07,.735,.93,.77),.021,MONO)
 s.text('Sign-up sheets in the practice wing',(.07,.80,.93,.845),.023,ITALIC)
 s.footer('MUSIC SOCIETY  ·  ALL STUDENTS WELCOME')

def lyric(s):
 s.ground=(119,42,35)
 # Independent local printer: ornamental rule, amber stock and a generous
 # music-hall serif, visibly separate from Ellery's institutional house face.
 for inset in[.045,.065]:
  s.line([(inset,inset),(.999-inset,inset),(.999-inset,.999-inset),(inset,.999-inset),(inset,inset)],YELLOW,.002)
 s.text('THE',(.13,.10,.87,.15),.045,BOLD,CREAM,align='center')
 s.text('LYRIC',(.10,.15,.90,.29),.17,BOLD,YELLOW,align='center')
 for x in[.21,.71]:
  s.ellipse((x,.325,x+.08,.385),YELLOW);s.line([(x+.07,.35),(x+.07,.29),(x+.14,.275)],YELLOW,.006)
 s.text('AFTER',(.12,.42,.88,.50),.09,BOLD,CREAM,align='center')
 s.text('THE LAST',(.12,.51,.88,.58),.08,BOLD,CREAM,align='center')
 s.text('NOTE',(.12,.59,.88,.69),.14,BOLD,YELLOW,align='center')
 s.text('Music in the snug',(.12,.735,.88,.78),.033,ITALIC,CREAM,align='center')
 s.text('FRIDAY EVENINGS',(.12,.812,.88,.845),.024,SANS,CREAM,align='center')
 s.text('No tickets. A place by the fire.',(.12,.868,.88,.901),.023,ITALIC,CREAM,align='center')

def studio_mark(s,ink=INK):
 # The same institution's experimental print room has a quieter, offset
 # imprint. It does not put every new series into the formal season template.
 s.text('ELLERY',(.065,.035,.40,.065),.023,SANS,ink)
 s.text('EXPERIMENTAL MUSIC',(.52,.035,.935,.065),.013,MONO,ink,align='right')

def loudspeakers(s):
 s.ground=(218,211,183);red=(187,60,36);studio_mark(s)
 s.text('ROOM',(.065,.105,.93,.19),.115,SANS)
 s.text('WITHOUT PLAYERS',(.065,.195,.93,.255),.057,NARROW)
 # A spatial projection score: eight outward-facing loudspeakers describe a
 # room, and the centre is conspicuously left empty. No decorative performer.
 cx=.50;cy=.505
 for radius in[.17,.25,.32]:s.ellipse((cx-radius,cy-radius*.70,cx+radius,cy+radius*.70),red,.003)
 for i in range(8):
  a=i*math.pi/4;rx=math.cos(a);ry=math.sin(a)
  x=cx+rx*.355;y=cy+ry*.218
  tangent=(-ry*.026,rx*.019);dx=rx*.028;dy=ry*.017
  s.polygon([(x-dx+tangent[0],y-dy+tangent[1]),(x-dx-tangent[0],y-dy-tangent[1]),(x+dx-tangent[0]*.6,y+dy-tangent[1]*.6),(x+dx+tangent[0]*.6,y+dy+tangent[1]*.6)],INK)
  s.line([(cx+rx*.075,cy+ry*.053),(cx+rx*.30,cy+ry*.211)],INK,.0017)
 s.ellipse((.475,.487,.525,.523),s.ground)
 s.text('ELECTROACOUSTIC',(.065,.775,.935,.832),.058,NARROW,red)
 s.text('LOUDSPEAKER ORCHESTRA',(.065,.846,.935,.884),.032,SANS,red)
 s.line([(.065,.907),(.935,.907)],INK,.002)
 s.text('FIXED MEDIA / SPATIAL SOUND',(.065,.925,.935,.95),.016,MONO)
 s.text('AN EVENING IN THE CONCERT HALL',(.065,.96,.935,.98),.012,SANS)

def live_electronics(s):
 s.ground=(32,39,38);acid=(210,217,90);muted=(139,175,163);studio_mark(s,acid)
 s.text('LIVE',(.065,.11,.935,.245),.19,SANS,acid)
 s.text('WIRES',(.065,.25,.935,.38),.18,SANS,acid)
 # Two unequal signal paths repeatedly couple then split. The filled nodes
 # and instrument-like strokes are an authored topology, not fake circuitry
 # copied from an unknown electrical diagram.
 for i in range(4):
  y=.445+i*.068
  s.line([(.07,y),(.23,y),(.34,y+.043),(.51,y+.043),(.63,y-.015),(.93,y-.015)],acid,.005)
  s.line([(.07,y+.037),(.18,y+.037),(.38,y-.005),(.56,y-.005),(.68,y+.043),(.93,y+.043)],muted,.002)
  s.ellipse((.323,y+.031,.355,y+.055),acid)
 s.text('INSTRUMENTS',(.065,.77,.935,.81),.042,SANS,acid)
 s.text('+ LIVE ELECTRONICS',(.065,.815,.935,.858),.038,NARROW,acid)
 s.text('The instrument listens back',(.065,.875,.935,.907),.025,ITALIC,muted)
 s.line([(.065,.93),(.935,.93)],muted,.002)
 s.text('ELLERY / CONCERT HALL',(.065,.95,.935,.978),.014,MONO,acid)

def tape(s):
 s.ground=(216,135,112);navy=(32,52,66);studio_mark(s,navy)
 s.text('TAPE',(.065,.10,.935,.25),.21,MONO,navy)
 s.text('MUSIC',(.065,.25,.935,.345),.13,MONO,navy)
 # Actual magnetic-tape logic: two reels share one continuous exposed path.
 # The page leaves the spools dominant rather than illustrating a player.
 for x,y,r in[(.32,.535,.22),(.74,.625,.16)]:
  s.ellipse((x-r,y-r*.70,x+r,y+r*.70),navy,.014)
  s.ellipse((x-r*.66,y-r*.46,x+r*.66,y+r*.46),navy,.003)
  s.ellipse((x-.031,y-.022,x+.031,y+.022),navy)
  for k in range(3):
   a=k*math.pi*2/3;dx=math.cos(a)*r*.48;dy=math.sin(a)*r*.34
   s.ellipse((x+dx-.027,y+dy-.019,x+dx+.027,y+dy+.019),navy)
 s.line([(.15,.428),(.18,.37),(.63,.455),(.82,.535)],navy,.008)
 s.line([(.18,.66),(.26,.73),(.71,.765),(.84,.70)],navy,.008)
 s.text('FIXED MEDIA',(.065,.81,.935,.85),.035,SANS,navy)
 s.text('Reel-to-reel / Archive / New work',(.065,.865,.935,.90),.022,ITALIC,navy)
 s.line([(.065,.928),(.935,.928)],navy,.002)
 s.text('LISTENING SESSIONS AT ELLERY',(.065,.95,.935,.978),.014,MONO,navy)

def new_works(s):
 s.ground=(221,221,202);red=(177,46,46);cyan=(46,95,119);studio_mark(s)
 # A poster composed as a false-start score: blocks enter at different times,
 # while the typographic pauses keep the title emphatic and readable.
 for copy,y,width in[('NOT',.115,.59),('YET',.255,.63),('HEARD',.395,.935)]:
  s.text(copy,(.065,y,width,y+.12),.17,SANS,red)
 for i,(x,y,w) in enumerate([(.07,.565,.36),(.37,.615,.51),(.16,.69,.65)]):
  for j in range(4):s.line([(x,y+j*.012),(x+w,y+j*.012)],cyan,.0015)
  for t in range(7):
   xx=x+(t+.3)*w/7;s.rect((xx,y-.008*(t%3),xx+.009,y+.04+.005*(t%2)),cyan)
 s.text('NEW MUSIC',(.065,.77,.935,.825),.065,SANS,red)
 s.text('COMPOSERS’ FORUM',(.065,.837,.935,.872),.026,SANS,red)
 s.text('First performances / Open rehearsal',(.065,.881,.935,.913),.019,ITALIC)
 s.line([(.065,.935),(.935,.935)],INK,.002)
 s.text('NEW WORKS FROM THE SCHOOL / RECITAL ROOM',(.065,.951,.935,.98),.013,MONO)

def graphic_score(s):
 s.ground=(224,225,207);green=(119,158,88);studio_mark(s)
 s.text('READ',(.065,.11,.935,.225),.17,BOLD)
 s.text('THE ROOM',(.065,.23,.935,.31),.09,BOLD)
 # This is an original, performable open score, not staff notation used as
 # wallpaper: one row per voice, with intervals, long tones and free gestures.
 x0=.07;y0=.365;cw=.172;rh=.072
 for r in range(5):
  for c in range(5):
   x=x0+c*cw;y=y0+r*rh
   if (r+c)%4==0:s.rect((x+.002,y+.002,x+cw-.002,y+rh-.002),green)
   else:s.line([(x,y),(x+cw,y),(x+cw,y+rh),(x,y+rh),(x,y)],INK,.001)
   if (r*3+c)%3==0:s.ellipse((x+.04,y+.023,x+.077,y+.049),INK)
   elif (r*3+c)%3==1:s.line([(x+.025,y+.052),(x+.06,y+.02),(x+.09,y+.044),(x+.145,y+.015)],INK,.003)
   else:s.line([(x+.03,y+.035),(x+.143,y+.035)],INK,.005)
 s.text('GRAPHIC SCORES',(.065,.765,.935,.81),.037,SANS)
 s.text('OPEN WORKSHOP',(.065,.815,.935,.85),.029,MONO)
 s.text('Marks, gestures, listening',(.065,.87,.935,.907),.026,ITALIC)
 s.line([(.065,.935),(.935,.935)],INK,.002)
 s.text('MUSIC SOCIETY / VOICES + INSTRUMENTS',(.065,.95,.935,.98),.013,MONO)

def prepared(s):
 s.ground=(212,213,203);plum=(78,52,79);amber=(168,116,50);studio_mark(s,plum)
 s.text('OBJECTS',(.065,.115,.935,.235),.145,NARROW,plum)
 s.text('FOR PIANO',(.065,.245,.935,.32),.09,NARROW,plum)
 # A disassembled, oblique keyboard. Each differently placed object has its
 # own outline; a graphic score for metal, felt and wood crossing the strings.
 for i in range(9):
  x=.07+i*.091;dy=.045*math.sin(i*.70)
  s.polygon([(x,.45+dy),(x+.069,.42+dy),(x+.069,.685+dy),(x,.715+dy)],CREAM)
  s.line([(x,.45+dy),(x+.069,.42+dy),(x+.069,.685+dy),(x,.715+dy),(x,.45+dy)],plum,.002)
  if i in[0,1,3,4,5,7]:s.polygon([(x+.055,.432+dy),(x+.094,.414+dy),(x+.094,.575+dy),(x+.055,.594+dy)],plum)
 for x,y in[(.18,.51),(.39,.63),(.69,.50)]:
  s.polygon([(x+.025*math.cos(k*math.pi/3),y+.018*math.sin(k*math.pi/3)) for k in range(6)],amber)
  s.ellipse((x-.009,y-.006,x+.009,y+.006),plum)
 s.line([(.15,.74),(.15,.39),(.84,.39)],amber,.002)
 s.text('PREPARED PIANO + TAPE',(.065,.795,.935,.838),.035,SANS,plum)
 s.text('Metal, felt, wood and recorded sound',(.065,.852,.935,.892),.022,ITALIC,plum)
 s.line([(.065,.928),(.935,.928)],plum,.002)
 s.text('THE SOLO RECITAL SERIES / ELLERY',(.065,.95,.935,.98),.014,MONO,plum)

functions=locals().copy();evidence=[];previews=[]
for design in config['designs']:
 s=Sheet(design);functions[design['id']](s);h,w=s.h,s.w
 stock=np.broadcast_to(np.array(s.ground,dtype=float),(h,w,3)).copy();rough=np.full((h,w),.88);metal=np.zeros((h,w));zero=np.zeros((h,w));profile=config['finish']
 basejob={'id':design['id'],'widthM':design['widthM'],'heightM':design['heightM'],'_inkSrgb':INK,'_groundSrgb':s.ground,'_coverageSha256':''}
 stock,rough,metal,height,finish=finish_surface(basejob,profile,zero,stock,rough,metal,False,np.random.default_rng(seeded(design['id'])))
 total=np.zeros((h,w));composite=np.broadcast_to(np.array(s.ground,dtype=float),(h,w,3)).copy()
 for i,(mask,ink) in enumerate(s.layers):
  a=np.asarray(mask,dtype=float)/255
  composite=composite*(1-a[...,None])+np.array(ink)[None,None,:]*a[...,None]
  total=1-(1-total)*(1-a)
 # One physical absorbed-ink film carries all spot colours. Derive the same
 # manufacturing variation from the shared paper finish, then apply it to the
 # exact authored multicolour overprint; do not stack fictitious relief at
 # every overlapping shape or rerun paper manufacture for each text line.
 job={**basejob,'_inkSrgb':[255,255,255],'_coverageSha256':hashlib.sha256(np.uint8(total*255).tobytes()).hexdigest()}
 finished,rough,metal,relief,_=finish_surface(job,profile,total,stock,rough,metal,True,np.random.default_rng(seeded(design['id']+':ink')))
 denom=np.maximum(1e-8,total[...,None]);variation=(finished-stock*(1-total[...,None]))/denom/255
 pigment=(composite-np.array(s.ground)[None,None,:]*(1-total[...,None]))/denom
 stock=stock*(1-total[...,None])+pigment*variation*total[...,None];height+=relief
 # Total ink coverage describes the same physical print in the depth-winning
 # normal material pass; it is not paper transparency.
 rgba=np.dstack([np.uint8(np.clip(stock,0,255)),np.uint8(np.clip(total,0,1)*255)])
 im=Image.fromarray(rgba,'RGBA');im.save(OUT/(design['id']+'-albedo.png'))
 dx=design['widthM']/w;dy=design['heightM']/h;gx=np.gradient(height,axis=1)/dx;gy=np.gradient(height,axis=0)/dy
 normals=np.stack([-gx,-gy,np.ones_like(gx)],axis=-1);normals/=np.linalg.norm(normals,axis=-1)[...,None]
 mw=design.get('materialWidthPx',256);material_size=(mw,round(mw*h/w))
 Image.fromarray(np.uint8(np.clip(normals*.5+.5,0,1)*255),'RGB').resize(material_size,Image.Resampling.LANCZOS).save(OUT/(design['id']+'-normal.png'))
 orm=np.dstack([np.ones((h,w)),np.clip(rough,.08,1),np.clip(metal,0,1)])
 Image.fromarray(np.uint8(orm*255),'RGB').resize(material_size,Image.Resampling.LANCZOS).save(OUT/(design['id']+'-orm.png'))
 # Conventional opaque studio proof; the GPU texture's alpha remains coverage.
 proof=Image.fromarray(rgba[:,:,:3],'RGB');proof.save(OUT/(design['id']+'-proof.png'));previews.append(proof)
 evidence.append({**design,'pixels':[w,h],'materialPixels':list(material_size),'regions':s.regions,'coverage':float(np.mean(total)),'coverageSha256':hashlib.sha256(rgba[:,:,3].tobytes()).hexdigest(),'paperFinish':finish,'lightingBaked':False,'fontSubstitution':False})
thumbw=300;gap=25;thumbh=round(thumbw*.841/.594);rows=math.ceil(len(previews)/5);contact=Image.new('RGB',(5*(thumbw+gap)+gap,rows*(thumbh+gap)+gap),(47,51,50));dr=ImageDraw.Draw(contact)
for i,p in enumerate(previews):
 p.thumbnail((thumbw,thumbh));contact.paste(p,(gap+(i%5)*(thumbw+gap)+(thumbw-p.width)//2,gap+(i//5)*(thumbh+gap)))
contact.save(OUT/'contact-sheet.png')
(OUT/'artwork.json').write_text(json.dumps({'version':1,'source':'authored fictional Ellery publicity','fonts':font_proof,'designs':evidence},indent=2)+'\n')
print(json.dumps({'designs':len(evidence),'fonts':len(font_proof)}))
