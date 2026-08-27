'use client';
import { useEffect, useState } from 'react';
import { LoaderCircle, MapPin } from 'lucide-react';

type Suggestion={id:string;label:string;city:string;postcode:string};
export default function AddressAutocomplete({value,city,onChange}:{value:string;city:string;onChange:(address:string,city:string)=>void}){
 const [query,setQuery]=useState(value),[items,setItems]=useState<Suggestion[]>([]),[loading,setLoading]=useState(false),[open,setOpen]=useState(false);
 useEffect(()=>setQuery(value),[value]);
 useEffect(()=>{if(query.trim().length<3){setItems([]);setOpen(false);return}const controller=new AbortController();const timer=setTimeout(async()=>{setLoading(true);try{const response=await fetch(`https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=6&autocomplete=1`,{signal:controller.signal});if(!response.ok)throw new Error('address');const json=await response.json();setItems((json.features??[]).map((feature:any)=>({id:`${feature.properties.id}-${feature.properties.label}`,label:feature.properties.label,city:feature.properties.city,postcode:feature.properties.postcode})));setOpen(true)}catch(error){if((error as Error).name!=='AbortError')setItems([])}finally{setLoading(false)}},250);return()=>{clearTimeout(timer);controller.abort()}},[query]);
 return <div className="address-autocomplete"><div className="address-input"><MapPin size={18}/><input required value={query} onChange={event=>{setQuery(event.target.value);onChange(event.target.value,city)}} onFocus={()=>items.length&&setOpen(true)} placeholder="Commencez à saisir l’adresse…" autoComplete="off"/>{loading&&<LoaderCircle className="spin" size={17}/>}</div>{open&&items.length>0&&<div className="address-suggestions" role="listbox">{items.map(item=><button type="button" role="option" key={item.id} onClick={()=>{setQuery(item.label);onChange(item.label,item.city);setOpen(false)}}><MapPin size={16}/><span>{item.label}<small>{item.postcode} · {item.city}</small></span></button>)}</div>}</div>
}

