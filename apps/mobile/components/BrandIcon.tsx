import Svg,{Path} from 'react-native-svg';

type Name='bell'|'feed'|'calendar'|'ticket'|'search';

export default function BrandIcon({name,color='#F8F7FF',size=21}:{name:Name;color?:string;size?:number}){
 const common={stroke:color,strokeWidth:1.8,strokeLinecap:'round' as const,strokeLinejoin:'round' as const,fill:'none'};
 return <Svg width={size} height={size} viewBox="0 0 24 24">
  {name==='bell'?<><Path {...common} d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><Path {...common} d="M10 21h4"/></>:
   name==='feed'?<><Path {...common} d="M4 5h16M4 12h16M4 19h10"/><Path {...common} d="M19 19h.01"/></>:
   name==='calendar'?<><Path {...common} d="M5 3v3M19 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/><Path {...common} d="m8 13 2 2 5-5"/></>:
   name==='ticket'?<><Path {...common} d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z"/><Path {...common} d="M9 8v8"/></>:
   <Path {...common} d="M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1 5 4 4"/>}
 </Svg>
}
