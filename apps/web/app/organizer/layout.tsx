import { ReactNode } from 'react';
import OrganizationShell from './OrganizationShell';

export default function OrganizerLayout({children}:{children:ReactNode}){
  return <OrganizationShell>{children}</OrganizationShell>;
}
