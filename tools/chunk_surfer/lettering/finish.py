"""Causal, metre-scaled print finishes. Coverage is immutable input.

No lighting is baked here: color describes stock/coating/deposit, roughness
describes surface spread, and height is micrometre manufacturing relief only.
Applied text patches never acquire an object-sized dirty rectangular border.
"""
from PIL import Image
import numpy as np
import math


def field(rng, width, height, width_m, height_m, scale_m, amplitude=1):
    grid=(max(2,math.ceil(width_m/scale_m)+1),max(2,math.ceil(height_m/scale_m)+1))
    image=Image.fromarray(np.uint8(rng.random((grid[1],grid[0]))*255))
    return (np.asarray(image.resize((width,height),Image.Resampling.BICUBIC),dtype=float)/255-.5)*amplitude


def finish_surface(job, profile, coverage, stock, stock_rough, stock_metal, sampled, rng):
    h,w=coverage.shape;wm=job['widthM'];hm=job['heightM'];family=profile['profile'];support=profile['support']
    broad=field(rng,w,h,wm,hm,profile['fieldM']);mid=field(rng,w,h,wm,hm,max(.008,profile['fieldM']*.28))
    fine=field(rng,w,h,wm,hm,max(.0015,profile['fieldM']*.035))
    colors=stock.copy();rough=stock_rough.copy();metal=stock_metal.copy();height=np.zeros((h,w))
    # At least two texels per cycle; subpixel fabrication becomes roughness,
    # not a high-frequency normal which would shimmer through final dithering.
    dx=wm/w;dy=hm/h;yy,xx=np.mgrid[0:h,0:w];xm=(xx+.5)*dx;ym=(yy+.5)*dy
    pigment_variation=np.ones((h,w));structure={'kind':'subpixel manufacture','actualPitchM':None,'resolved':False};mosaic_tile=None;mosaic_joint=None
    if not sampled:
        colors*=1+broad[...,None]*profile['variation']*2
        rough+=broad*profile['roughnessVariation']
        height+=mid*profile['microReliefM']
        if family in ('paper-print','painted-card'):
            # Formation rather than faux creases: linear fibres remain low
            # contrast, with enough broad stock modulation to survive mipmaps.
            fibres=field(rng,w,h,wm,hm,max(.005,dx*3))*.5+mid*.5
            colors*=1+fibres[...,None]*.014;rough+=fibres*.02
        elif family in ('painted-cloth','rope-stencil'):
            # Manufacture never grows to meet the raster. Average unresolved
            # threads into the profile roughness instead of inventing a much
            # coarser basket weave. Four samples/cycle is the normal-map gate.
            pitch=.0028 if family=='painted-cloth' else .008
            resolved=pitch>=4*max(dx,dy)
            structure={'kind':'weave','actualPitchM':pitch,'resolved':resolved}
            if resolved:
                warp=np.sin(xm*(2*np.pi/pitch));weft=np.sin(ym*(2*np.pi/pitch));weave=(warp+weft)*.5
                colors*=1+weave[...,None]*(.008 if family=='painted-cloth' else .02)
                rough+=weave*.018;height+=weave*profile['microReliefM']*.35
        elif family=='brass-plate':
            # Alloy darkening is brown/neutral and smoother at actual contact.
            metal[:]=profile.get('metallic',.78)
            tarnish=np.clip(broad*1.5+mid*.35+.20,0,.65)
            colors*=1-tarnish[...,None]*np.array([.13,.16,.19]);rough+=tarnish*.15
        elif family=='ceramic-mosaic':
            # Individual 16 mm ceramic units, a quiet 0.6 mm matte mortar seam.
            # Relief is deliberately omitted: actual tessera breakage is mesh.
            pitch=.016;joint=.0006;resolved=pitch>=4*max(dx,dy);joint_resolved=joint>=2*max(dx,dy)
            structure={'kind':'ceramic tessera','actualPitchM':pitch,'jointM':joint,'resolved':resolved,'jointResolved':joint_resolved}
            if resolved:
                cols=np.floor(xm/pitch).astype(int);rows=np.floor(ym/pitch).astype(int)
                mosaic_tile=(np.sin(cols*127.1+rows*311.7+1)*43758.5453)%1-.5
                colors*=1+mosaic_tile[...,None]*.022;rough+=mosaic_tile*.055
            if joint_resolved:
                mosaic_joint=(np.mod(xm,pitch)<joint)|(np.mod(ym,pitch)<joint)
                colors[mosaic_joint]*=.97;rough[mosaic_joint]=.9
            else:
                # The exact joint area is integrated into finish response.
                # No one-pixel invented groove or enlarged tessera is drawn.
                fraction=1-(1-joint/pitch)**2
                colors*=1-fraction*.03;rough=rough*(1-fraction)+.9*fraction
    # Manufacture stays inside solid pigment; no pinholes, missing strokes or
    # appearance of a white edge around a dark core is introduced by finishing.
    if family in ('painted-card','painted-cloth','rope-stencil'):
        brush=field(rng,w,h,wm,hm,max(.018,wm*.07))*.5+mid*.5
        pigment_variation+=brush*.035
    elif family=='gilt-enamel':
        # Leaf/burnish scale is broader than subpixel scratching, avoiding
        # metallic sparkle. The approved mean gold and metal factor stay put.
        pigment_variation+=broad*.028+mid*.009
    else:pigment_variation+=broad*.018
    ink=np.asarray(job['_inkSrgb'],dtype=float)[None,None,:]*pigment_variation[...,None]
    ink_rough=job.get('inkRoughness',profile['inkRoughness'])+broad*profile['roughnessVariation']*.65
    if mosaic_tile is not None:ink*=1+mosaic_tile[...,None]*.022;ink_rough+=mosaic_tile*.055
    if family=='ceramic-mosaic' and not structure.get('jointResolved',False):
        fraction=1-(1-.0006/.016)**2;ink_rough=ink_rough*(1-fraction)+.9*fraction
    if mosaic_joint is not None:ink_rough[mosaic_joint]=.9
    ink_metal=np.full((h,w),job.get('inkMetallic',profile.get('inkMetallic',0)),dtype=float)
    if family=='gilt-enamel':ink_metal*=1-np.clip(mid,0,.5)*.025
    # Deposits are a thin layer over substrate or pigment, not an AO ring. The
    # perimeter mask is legal only for a genuinely identified full carrier.
    deposit=np.zeros((h,w));contact=np.zeros((h,w));loss=np.zeros((h,w))
    if not sampled and support['kind']=='carrier':
        if support['edgeWear']:
            edge=np.minimum.reduce([xm,wm-xm,ym,hm-ym]);band=max(.0015,min(.012,min(wm,hm)*.045))
            exposed=np.clip(1-edge/band,0,1)
            deposit=np.clip(exposed*(.45+mid*.9)*profile['deposit'],0,.12)
            # Sparse actual perimeter chips reveal dull neutral support. This
            # never damages a character core; loss is suppressed under ink.
            loss=np.clip(exposed*(fine-.24)*profile['edgeLoss']*5,0,.12)*(coverage==0)
        if support['contact']!='none':
            lower=np.exp(-((ym-hm*.77)/max(.012,hm*.18))**2)
            lateral=np.exp(-((xm-wm*.57)/max(.025,wm*.28))**2)
            contact=lower*lateral*np.clip(.55+broad*.6,0,1)
            if support['contact']=='handled':contact=np.maximum(contact,np.exp(-((xm-wm*.76)/max(.014,wm*.15))**2-((ym-hm*.5)/max(.014,hm*.25))**2)*.6)
            rough-=contact*(.045 if family in ('paper-print','painted-card') else .09)
            ink_rough-=contact*.035
            deposit*=1-contact*.75
    colors=colors*(1-coverage[...,None])+ink*coverage[...,None]
    rough=rough*(1-coverage)+ink_rough*coverage;metal=metal*(1-coverage)+ink_metal*coverage
    if not sampled:
        colors*=1-deposit[...,None]*.5
        rough=rough*(1-deposit)+.93*deposit;metal*=1-deposit
        colors=colors*(1-loss[...,None])+np.asarray(job['_groundSrgb'])[None,None,:]*.69*loss[...,None]
        rough=rough*(1-loss)+.91*loss;metal*=1-loss
    # Manufacturing relief is band-limited above. Applied ink follows existing
    # stock; sampled normal bytes are restored exactly wherever coverage == 0.
    relief_m=profile.get('fabricationReliefM',job.get('reliefM',.000007));height+=coverage*relief_m
    # Direct stamping follows the sampled host. An applied local legend may
    # alter pigment response; its unprinted normal/roughness/metal channels are
    # immutable even if a profile later grows a more elaborate condition map.
    if sampled:
        clear=coverage==0;colors[clear]=stock[clear];rough[clear]=stock_rough[clear];metal[clear]=stock_metal[clear];height[clear]=0
    evidence={'profile':family,'support':support,'coverageSha256':job['_coverageSha256'],
      'immutableCoverage':True,'sampledStockOutsidePigmentImmutable':sampled,
      'physicalScalesM':{'field':profile['fieldM'],'minimumNormalPeriod':max(.0015,dx*3,dy*3),'inkRelief':relief_m},
      'structure':structure,'fabricationReliefAssumption':profile.get('fabricationReliefAssumption'),
      'conditionRanges':{'deposit':[float(deposit.min()),float(deposit.max())],'contact':[float(contact.min()),float(contact.max())],'edgeLoss':[float(loss.min()),float(loss.max())]},
      'channelRanges':{'roughness':[float(rough.min()),float(rough.max())],'metallic':[float(metal.min()),float(metal.max())]},
      'bakedLighting':False,'glyphDamage':False}
    return colors,rough,metal,height,evidence
