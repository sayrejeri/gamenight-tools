export function SignOutButton() {
  return (
    <form action="/api/auth/logout" method="post">
      <button className="button button-secondary" type="submit">Sign out</button>
    </form>
  );
}
