export default function middleware(req) {
  return new Response(null, {
    headers: {
      "Set-Cookie": `__EP_SECRET=${process.env.EP_SECRET}; Path=/; Secure; HttpOnly`
    }
  });
}
