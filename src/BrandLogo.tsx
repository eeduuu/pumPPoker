import brandArtwork from './assets/brand-artwork.jpg';

export function BrandLogo() {
 return <svg className="brand-logo" role="img" aria-label="PumꟼPoker" viewBox="150 70 1800 370" preserveAspectRatio="xMidYMid meet">
   <defs>
     <filter id="brand-transparent-background" colorInterpolationFilters="sRGB">
       <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  4 4 4 0 -0.25"/>
     </filter>
   </defs>
   <image href={brandArtwork} width="2000" height="520" filter="url(#brand-transparent-background)"/>
 </svg>;
}
