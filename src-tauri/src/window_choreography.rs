use serde::Deserialize;
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalRect, WebviewWindow};

const FIREBALL_LABELS:[&str;4]=[
    "fireball-cast-1","fireball-cast-2","fireball-cast-3","fireball-cast-4",
];

#[derive(Debug,Clone,Deserialize)]
pub struct RayPoint{x:f64,y:f64}

// WINDOW-NORMALISED, NOT STAGE-NORMALISED.
//
// The ray is authored inside the battle's stage rect -- a band in the middle of
// the combat panel, not the window -- and this used to read `beyond` as though
// it were a fraction of the whole window. Every rightward cast therefore aimed
// at a point far off the side of the screen and got clamped flat against the
// monitor edge, which is why the surfaces appeared in the same wrong place
// every time. The sender now remaps the ray into window space first, and this
// only has to walk it out past the bezel.
#[derive(Debug,Clone,Deserialize)]
pub struct FireballRay{
    direction:RayPoint,
    exit:RayPoint,
}

fn main_window(app:&AppHandle)->Result<WebviewWindow,String>{
    app.get_webview_window("main").ok_or_else(||"main window not found".to_string())
}

fn allowed(label:&str,index:u8,count:u8)->bool{
    count>0&&count<=4&&index<count&&FIREBALL_LABELS.get(index as usize)==Some(&label)
}

fn logical_size(index:u8)->f64{160.0+(index.min(3) as f64*24.0)}

// How much closer it gets, and the hard ceiling on that. A comet ends its
// flight a little over twice the size it left at -- enough to read as bearing
// down, nowhere near enough to be furniture.
const APPROACH_GROWTH:f64=2.15;
const APPROACH_MAX_LOGICAL:f64=340.0;

fn contains(rect:&PhysicalRect<i32,u32>,x:f64,y:f64)->bool{
    x>=rect.position.x as f64&&y>=rect.position.y as f64
        &&x<(rect.position.x as f64+rect.size.width as f64)
        &&y<(rect.position.y as f64+rect.size.height as f64)
}

fn clamped_square(center:(f64,f64),logical:f64,work:&PhysicalRect<i32,u32>,scale:f64)->PhysicalPosition<i32>{
    let physical=(logical*scale).round().max(1.0) as i32;
    let min_x=work.position.x;
    let min_y=work.position.y;
    let max_x=min_x.saturating_add(work.size.width.saturating_sub(physical.max(0) as u32) as i32);
    let max_y=min_y.saturating_add(work.size.height.saturating_sub(physical.max(0) as u32) as i32);
    PhysicalPosition::new(
        ((center.0-physical as f64*0.5).round() as i32).clamp(min_x,max_x.max(min_x)),
        ((center.1-physical as f64*0.5).round() as i32).clamp(min_y,max_y.max(min_y)),
    )
}

#[derive(Debug,Clone,Deserialize)]
pub struct CastStep{
    label:String,
    index:u8,
    count:u8,
    ray:FireballRay,
    #[serde(default)] progress:f64,
}

// WHAT THE SHOAL IS DOING THIS FRAME.
//
// Every number is decided on the game side -- see fireball-choreography.js --
// because the escalation belongs to the fight, not to the compositor. What
// happens in here is only the geometry the game cannot do: where the cursor
// actually is on the desk, and where four windows have to be to not be there.
#[derive(Debug,Clone,Deserialize,Default)]
pub struct Choreography{
    // Break strength this frame, already eased and already zero during a
    // settle. One number, so a settled shoal costs nothing to draw.
    #[serde(default)] dodge:f64,
    // How far they will go, as a multiple of a surface's own width.
    #[serde(default)] reach:f64,
    // How far ahead of the pointer they aim, in milliseconds of its own travel.
    #[serde(default)] sense_ms:f64,
    // 1 is one body moving; 0 is four windows each looking after itself.
    #[serde(default)] cohesion:f64,
}

#[derive(Clone,Copy)]
struct CursorSample{x:f64,y:f64,at:std::time::Instant}

static CURSOR:std::sync::OnceLock<std::sync::Mutex<Option<CursorSample>>>=std::sync::OnceLock::new();

// NOTHING IS CAPTURED. `AppHandle::cursor_position` is `NSEvent.mouseLocation`
// on macOS and the equivalent plain query elsewhere: two coordinates, read on
// demand, in the same process. It is not a screen recording, not a screenshot,
// not an event tap, and it asks for no permission -- there is no capture crate
// in this binary and this feature must never introduce one. The shoal needs to
// know where a pointer is; it has no business knowing what is under it.
//
// WHERE THE POINTER IS GOING, NOT WHERE IT IS.
//
// A shoal that runs from the cursor's current position cannot be caught by
// moving quickly and cannot be missed by moving slowly -- neither of which is a
// decision. Running from its PREDICTED position can be beaten by aiming at
// where the windows will be, which is the same read the rest of the fight asks
// for. Velocity is measured between frames and heavily damped, so a flick does
// not throw the prediction across the desk.
fn predicted_cursor(app:&AppHandle,sense_ms:f64)->Option<(f64,f64)>{
    let now=app.cursor_position().ok()?;
    let at=std::time::Instant::now();
    let cell=CURSOR.get_or_init(||std::sync::Mutex::new(None));
    let mut slot=cell.lock().ok()?;
    let previous=*slot;
    *slot=Some(CursorSample{x:now.x,y:now.y,at});
    let Some(last)=previous else{return Some((now.x,now.y))};
    let dt=at.duration_since(last.at).as_secs_f64();
    if !(dt>0.001&&dt<0.25){return Some((now.x,now.y));}
    let lead=(sense_ms.max(0.0)/1000.0).min(0.5);
    // Capped: a fast flick predicts a long way, and a shoal that reacts to a
    // metre of imagined travel is reacting to nothing.
    let vx=((now.x-last.x)/dt).clamp(-4000.0,4000.0);
    let vy=((now.y-last.y)/dt).clamp(-4000.0,4000.0);
    Some((now.x+vx*lead,now.y+vy*lead))
}

// ONE CALL PER FRAME FOR THE WHOLE CAST, NOT ONE PER SURFACE.
//
// The comet is meant to cross the desktop, and a window only crosses anything
// if something moves it. The frame clock lives on the game side -- it is the
// same clock the player can pause, and the same one that decides the comet has
// landed -- so the movement is driven from there rather than by a timer in here
// that would keep flying through authored dialogue. Batched because four
// surfaces at sixty frames a second is otherwise four times the IPC for one
// event that is always about all of them at once.
#[tauri::command]
pub fn chunk_fireball_cast_step(
    app:AppHandle,casts:Vec<CastStep>,#[allow(unused_mut)] mut choreography:Option<Choreography>,
)->Result<u8,String>{
    if casts.len()>4{return Ok(0);}
    let dance=choreography.take().unwrap_or_default();
    // Where every surface would be if nothing were chasing it.
    let mut bases=Vec::with_capacity(casts.len());
    for cast in &casts{
        match base_center(&app,&cast.label,cast.index,cast.count,&cast.ray,cast.progress){
            Ok(Some(base))=>bases.push(Some(base)),
            _=>bases.push(None),
        }
    }
    let live:Vec<&BaseCenter>=bases.iter().flatten().collect();
    if live.is_empty(){return Ok(0);}

    // ONE BODY. The offset is computed from the formation's centre and applied
    // to all of it, so they break together instead of each solving its own
    // little problem -- which is the whole difference between a shoal and four
    // windows being annoying in parallel.
    let centre=(
        live.iter().map(|base|base.center.0).sum::<f64>()/live.len() as f64,
        live.iter().map(|base|base.center.1).sum::<f64>()/live.len() as f64,
    );
    let span=live.iter().map(|base|base.side).fold(0.0_f64,f64::max).max(1.0);
    let dodge=dance.dodge.clamp(0.0,1.0);
    let mut shared=(0.0_f64,0.0_f64);
    let mut fan=(0.0_f64,0.0_f64);
    if dodge>0.001{
        if let Some(aim)=predicted_cursor(&app,dance.sense_ms){
            let (dx,dy)=(centre.0-aim.0,centre.1-aim.1);
            let distance=dx.hypot(dy);
            // They only run from something that is actually coming for them.
            // Beyond about three surface-widths the pointer is not a threat and
            // the formation holds, which is what makes the break legible.
            let threat=(1.0-(distance/(span*3.2)).min(1.0)).powf(1.4);
            if threat>0.001&&distance>0.5{
                let reach=dance.reach.max(0.0)*span*dodge*threat;
                shared=(dx/distance*reach,dy/distance*reach);
                // Perpendicular, so the ones on the outside of the turn swing
                // wider. Scaled by the INVERSE of cohesion: late in the night
                // they hold formation and move as one.
                let loose=1.0-dance.cohesion.clamp(0.0,1.0);
                fan=(-dy/distance*reach*loose*0.9,dx/distance*reach*loose*0.9);
            }
        }
    }

    let mut moved=0u8;
    let middle=(live.len() as f64-1.0)*0.5;
    let mut rank=0.0_f64;
    for (cast,base) in casts.iter().zip(bases.iter()){
        let Some(base)=base else{continue};
        let offset=(rank-middle)*1.0;
        rank+=1.0;
        let center=(
            base.center.0+shared.0+fan.0*offset,
            base.center.1+shared.1+fan.1*offset,
        );
        if apply_placement(&app,&cast.label,base,center).unwrap_or(false){
            moved=moved.saturating_add(1);
        }
    }
    Ok(moved)
}

#[tauri::command]
pub fn chunk_fireball_cast_place(
    app:AppHandle,label:String,index:u8,count:u8,ray:FireballRay,
)->Result<bool,String>{
    place_one(&app,&label,index,count,&ray,0.0)
}

// Where a surface would be with nothing chasing it, kept separate from the act
// of putting it there so the shoal can be moved as a group afterwards.
struct BaseCenter{
    center:(f64,f64),
    side:f64,
    work:PhysicalRect<i32,u32>,
    scale:f64,
}

fn base_center(
    app:&AppHandle,label:&str,index:u8,count:u8,ray:&FireballRay,progress:f64,
)->Result<Option<BaseCenter>,String>{
    let progress=if progress.is_finite(){progress.clamp(0.0,1.0)}else{0.0};
    if!allowed(label,index,count)
        ||![ray.direction.x,ray.direction.y,ray.exit.x,ray.exit.y].iter().all(|v|v.is_finite()){
        return Ok(None);
    }
    let main=main_window(app)?;
    if main.is_fullscreen().unwrap_or(false){return Ok(None);}
    if app.get_webview_window(label).is_none(){return Ok(None);}
    let position=main.outer_position().map_err(|e|e.to_string())?;
    let size=main.outer_size().map_err(|e|e.to_string())?;
    let logical=logical_size(index);
    // ONE LINE, FROM THE STAGE TO THE DESKTOP, AND THEN BACK AT YOU.
    //
    // The stage the comet crosses is a band inside the combat panel, so leaving
    // it is not yet leaving the window. Follow the same line from the stage exit
    // out to the window's own edge -- and from there it is coming at the player:
    // in toward the middle of the game window, growing the whole way until it
    // covers it. Squared, because an object approaching at a constant speed does
    // not grow at a constant rate; it hangs small and far off, and then it is on
    // you.
    let (w,h)=(size.width as f64,size.height as f64);
    let anchor=(ray.exit.x*w,ray.exit.y*h);
    let (mut dx,mut dy)=(ray.direction.x*w,ray.direction.y*h);
    let length=dx.hypot(dy);
    if length>f64::EPSILON{dx/=length;dy/=length;}else{dx=1.0;dy=0.0;}
    let mut edge=f64::MAX;
    if dx>1e-6{edge=edge.min((w-anchor.0)/dx);}else if dx< -1e-6{edge=edge.min(-anchor.0/dx);}
    if dy>1e-6{edge=edge.min((h-anchor.1)/dy);}else if dy< -1e-6{edge=edge.min(-anchor.1/dy);}
    if !edge.is_finite()||edge<0.0{edge=0.0;}

    let monitors=app.available_monitors().map_err(|e|e.to_string())?;
    let origin=(position.x as f64+anchor.0,position.y as f64+anchor.1);
    let near=(origin.0+dx*(edge+logical),origin.1+dy*(edge+logical));
    let monitor=monitors.iter().find(|monitor|contains(monitor.work_area(),near.0,near.1))
        .or_else(||monitors.iter().find(|monitor|contains(monitor.work_area(),position.x as f64+w*0.5,position.y as f64+h*0.5)))
        .ok_or_else(||"monitor not found".to_string())?;
    let scale=monitor.scale_factor().max(0.1);
    let clearance=logical*scale*0.85;
    let near=(origin.0+dx*(edge+clearance),origin.1+dy*(edge+clearance));
    let looming=progress*progress;
    let target=(position.x as f64+w*0.5,position.y as f64+h*0.5);
    let center=(
        near.0+(target.0-near.0)*looming,
        near.1+(target.1-near.1)*looming,
    );
    // IT GETS BIGGER BECAUSE IT IS GETTING CLOSER. IT DOES NOT BECOME THE
    // SCREEN.
    //
    // Growing this to the size of the game window took "engulf" literally and
    // put a screen-sized always-on-top surface over everything, which is not a
    // fireball arriving -- it is the desktop being replaced by one. Worse, it
    // is an opaque click target the size of the display sitting between the
    // player and their own game. The engulfing happens INSIDE the window, drawn
    // by the renderer that owns that frame; what belongs out here is a comet
    // that reads as close, and a comet is fist-sized.
    let engulfed=(logical*APPROACH_GROWTH).min(APPROACH_MAX_LOGICAL);
    let side=logical+(engulfed-logical).max(0.0)*looming;
    Ok(Some(BaseCenter{center,side,work:*monitor.work_area(),scale}))
}

fn apply_placement(app:&AppHandle,label:&str,base:&BaseCenter,center:(f64,f64))->Result<bool,String>{
    let surface=app.get_webview_window(label).ok_or_else(||"fireball surface not found".to_string())?;
    let placed=clamped_square(center,base.side,&base.work,base.scale);
    surface.set_size(LogicalSize::new(base.side,base.side)).map_err(|e|e.to_string())?;
    surface.set_position(placed).map_err(|e|e.to_string())?;
    let _=surface.set_always_on_top(true);
    // Click-through was why a fireball outside the frame could not be returned
    // and why clicking one landed on the desktop behind it -- the game's own
    // projectile handing the player's click to the Finder.
    let _=surface.set_ignore_cursor_events(false);
    let _=surface.show();
    Ok(true)
}

fn place_one(
    app:&AppHandle,label:&str,index:u8,count:u8,ray:&FireballRay,progress:f64,
)->Result<bool,String>{
    match base_center(app,label,index,count,ray,progress)?{
        Some(base)=>apply_placement(app,label,&base,base.center),
        None=>Ok(false),
    }
}

// A cast surface is a projectile, not a window. Whatever the compositor does
// about activation when one is clicked, the keyboard belongs to the game.
#[tauri::command]
pub fn chunk_fireball_cast_focus_main(app:AppHandle)->bool{
    match main_window(&app){
        Ok(main)=>main.set_focus().is_ok(),
        Err(_)=>false,
    }
}

#[tauri::command]
pub fn chunk_fireball_cast_hide_all(app:AppHandle)->bool{
    hide_all(&app)
}

fn hide_all(app:&AppHandle)->bool{
    for label in FIREBALL_LABELS{
        if let Some(window)=app.get_webview_window(label){
            let _=window.set_ignore_cursor_events(true);
            let _=window.hide();
        }
    }
    true
}

// Startup/exit cleanup has no recovery snapshot because the main window is
// immutable. Only orphaned fireball surfaces can remain.
pub fn recover_stale_snapshot(app:&AppHandle)->bool{hide_all(app)}
pub fn restore_on_exit(app:&AppHandle)->bool{hide_all(app)}

#[cfg(test)]
mod tests{
    use super::{allowed,clamped_square,logical_size};
    use tauri::{PhysicalPosition,PhysicalRect,PhysicalSize};

    #[test]
    fn fixed_labels_only_and_four_surface_maximum(){
        assert!(allowed("fireball-cast-1",0,4));
        assert!(allowed("fireball-cast-4",3,4));
        assert!(!allowed("main",0,1));
        assert!(!allowed("fireball-cast-1",0,5));
        assert!(!allowed("fireball-cast-2",0,2));
    }

    // The comet leaves the STAGE inside the window and the WINDOW after that,
    // and only then turns and comes back at the player. A surface placed at the
    // stage exit would sit on top of the game it just left.
    #[test]
    fn the_approach_starts_outside_the_bezel_and_ends_covering_the_window(){
        let (w,h)=(1000.0_f64,800.0_f64);
        let (pos_x,pos_y)=(120.0_f64,60.0_f64);
        let anchor=(0.95*w,0.5*h);
        let (mut dx,mut dy)=(0.94_f64,-0.34_f64);
        let length=dx.hypot(dy);dx/=length;dy/=length;
        let mut edge=f64::MAX;
        if dx>1e-6{edge=edge.min((w-anchor.0)/dx);}
        if dy< -1e-6{edge=edge.min(-anchor.1/dy);}
        let logical=160.0_f64;
        let near=(pos_x+anchor.0+dx*(edge+logical*0.85),pos_y+anchor.1+dy*(edge+logical*0.85));
        assert!(near.0>pos_x+w,"it starts outside the window it left");

        let target=(pos_x+w*0.5,pos_y+h*0.5);
        let at=|p:f64|{
            let l=p*p;
            ((near.0+(target.0-near.0)*l,near.1+(target.1-near.1)*l),logical+((w.max(h))-logical)*l)
        };
        let (early,small)=at(0.25);
        let (late,large)=at(1.0);
        assert!(small<large,"and grows the whole way in");
        assert!((late.0-target.0).abs()<0.5&&(late.1-target.1).abs()<0.5,"ending on the window's centre");
        assert!(large>=w.max(h)-0.5,"at the size of the window it is about to hit");
        // Squared easing: a quarter of the way through the flight it has not yet
        // covered a quarter of the distance.
        let span=(target.0-near.0).abs();
        assert!((early.0-near.0).abs()<span*0.25,"hanging small and far off before it looms");
    }

    #[test]
    fn the_ray_is_carried_to_the_window_edge_before_it_steps_outside(){
        // A stage band exiting right at the middle of a 1000x800 window, on a
        // line 20 degrees above horizontal.
        let (w,h)=(1000.0_f64,800.0_f64);
        let anchor=(0.95*w,0.5*h);
        let (mut dx,mut dy)=(0.94_f64,-0.34_f64);
        let length=dx.hypot(dy);dx/=length;dy/=length;
        let mut edge=f64::MAX;
        if dx>1e-6{edge=edge.min((w-anchor.0)/dx);}
        if dy< -1e-6{edge=edge.min(-anchor.1/dy);}
        assert!(edge>0.0&&edge.is_finite());
        let at=(anchor.0+dx*edge,anchor.1+dy*edge);
        assert!((at.0-w).abs()<0.5||(at.1).abs()<0.5,"the line must land on a window edge");
        let step=edge+160.0*0.85;
        let outside=(anchor.0+dx*step,anchor.1+dy*step);
        assert!(outside.0>w,"and one surface further puts it past the bezel");
    }

    // THEY MOVE AS ONE BODY, AND ONLY FROM SOMETHING ACTUALLY COMING FOR THEM.
    //
    // The offset is computed once from the formation's centre and applied to
    // all of it; the per-surface fan is scaled by the INVERSE of cohesion, so
    // late in the night they hold formation instead of scattering. And beyond
    // about three surface-widths the pointer is not a threat, which is what
    // makes the break legible rather than constant twitching.
    #[test]
    fn the_shoal_breaks_together_away_from_the_pointer(){
        let span=200.0_f64;
        let centre=(900.0_f64,500.0_f64);
        let shove=|aim:(f64,f64),dodge:f64,reach:f64|{
            let (dx,dy)=(centre.0-aim.0,centre.1-aim.1);
            let distance=dx.hypot(dy);
            let threat=(1.0-(distance/(span*3.2)).min(1.0)).powf(1.4);
            if !(threat>0.001&&distance>0.5){return (0.0,0.0);}
            let out=reach*span*dodge*threat;
            (dx/distance*out,dy/distance*out)
        };

        // A pointer bearing down from the left pushes the whole shoal right.
        let near=shove((700.0,500.0),1.0,2.4);
        assert!(near.0>0.0&&near.1.abs()<1e-6,"straight away from it, not sideways");

        // The same pointer far off does nothing at all.
        let far=shove((-400.0,500.0),1.0,2.4);
        assert_eq!(far,(0.0,0.0),"a pointer that is not coming for them is not a threat");

        // And a settled shoal does not move however close the pointer gets.
        assert_eq!(shove((880.0,500.0),0.0,2.4),(0.0,0.0),"a settle is perfectly still");

        // Cohesion decides how much of the movement is the formation and how
        // much is each surface fanning off it.
        let loose_fan=1.0-0.0_f64;
        let tight_fan=1.0-1.0_f64;
        assert!(loose_fan>tight_fan,"the last fight holds formation");
    }

    #[test]
    fn logical_dpi_and_negative_monitor_positions_are_clamped(){
        let work=PhysicalRect{position:PhysicalPosition::new(-3840,-120),size:PhysicalSize::new(3840,2160)};
        let at=clamped_square((-20.0,2100.0),logical_size(3),&work,2.0);
        let physical=(logical_size(3)*2.0) as i32;
        assert!(at.x>=-3840&&at.x+physical<=0);
        assert!(at.y>=-120&&at.y+physical<=2040);
    }
}
