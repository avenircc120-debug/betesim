import { ReactNode } from 'react';

interface Props { children: ReactNode }

const ProfileGate = ({ children }: Props) => <>{children}</>;

export default ProfileGate;
