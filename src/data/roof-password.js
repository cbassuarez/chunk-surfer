// Ordinary service access, left with the gallery's housekeeping paperwork.
// The word is a door credential, not a cipher or a reward for making a take.
export const ROOF_PASSWORD = 'VESPER';
export const ROOF_PASSWORD_PAGE_ID = 'north-gallery-service-word';
export const ROOF_PASSWORD_HOST_ID = 'gallery-roof-service-slip';
export const ROOF_PASSWORD_PAGE = Object.freeze({
  id:ROOF_PASSWORD_PAGE_ID,at:{x:24,y:251.6},room:'academic',decay:.08,
  hosted:ROOF_PASSWORD_HOST_ID,pickupNoiseLabel:'paper lifted from the gallery console',
  title:'NORTH GALLERY SERVICE ACCESS',byline:'BUILDINGS DEPARTMENT · CARETAKER COPY',
  paper:{issuer:'facilities',template:'memo',reproduction:'original-handled'},
  body:[
    {raw:'DOOR       north gallery / exterior service stair'},
    {raw:`WORD LOCK  ${ROOF_PASSWORD}`},
    '',
    'The school master key releases the first bolt. Set the six letter wheels to the word above, then try the handle.',
    '',
    'Please leave this copy on the gallery console. The office set is packed. Close the gate after the roof inspection; the upper landing catches the wind.',
  ],
});
