import {useEffect,useState} from 'react';
import {api,post} from '../lib/api';
import type {User} from '../types';
export function useAuth(){
  const [user,setUser]=useState<User|null>(null);
  useEffect(()=>{api<User|null>('/auth/me').then(setUser).catch(()=>{});},[]);
  return {user,authenticate:async(mode:'login'|'register',data:unknown)=>{const user=await post<User>(`/auth/${mode}`,data);setUser(user);return user;},logout:async()=>{await post('/auth/logout',{});setUser(null);}};
}
