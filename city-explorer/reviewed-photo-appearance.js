/** Display-only bounds estimated from inspected existing user-footage crops. */
export const REVIEWED_PHOTO_APPEARANCES=Object.freeze({
 'way/1006575704':Object.freeze({
  source:'assets/sherbrooke-frontages/s03.jpg',confidence:'visual-estimate',
  wallColor:'#9d6862',
  depth:Object.freeze({porchWidthFraction:.94,porchHeightMetres:3.30,porchDepthMetres:.65,porchPostImageFractions:Object.freeze([.24,.56,.96]),balconyWidthFraction:.94}),
  hidePhotoDuplicatedMembers:true,
  silhouette:Object.freeze([[0,0],[1,0],[1,.63],[.51,.98],[.12,.65],[0,.46]].map(Object.freeze)),
  limitations:'Bounds follow visible roof/foliage edges in the processed crop, not a survey. Porch widths/posts are visual estimates aligned to this crop; depth is a conservative approximation. Perspective, lower vegetation and baked shadows remain. Original full-resolution source is unavailable in this checkout.'
 })
});
export function applyReviewedPhotoAppearance(profile,visuals='improved'){
 const override=visuals==='legacy'?null:REVIEWED_PHOTO_APPEARANCES[profile?.id];
 if(!override||!profile?.facadePhoto)return profile;
 return {...profile,...override.depth,wallColor:override.wallColor,hidePhotoDuplicatedMembers:override.hidePhotoDuplicatedMembers,facadePhoto:{...profile.facadePhoto,silhouette:override.silhouette}};
}
