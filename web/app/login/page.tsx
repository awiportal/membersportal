import LoginForm from './LoginForm';

// Auth page: render at request time, never statically prerendered at build.
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginForm />;
}
