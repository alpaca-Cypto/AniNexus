import { NextRequest, NextResponse } from 'next/server';

const legacyRoutes = new Map([
  ['/Timetable', '/timetable'],
  ['/Personal', '/personal'],
]);

export function proxy(request: NextRequest) {
  const destination = legacyRoutes.get(request.nextUrl.pathname);
  if (!destination) return NextResponse.next();

  return NextResponse.redirect(new URL(destination, request.url), 308);
}

export const config = {
  matcher: ['/Timetable', '/Personal'],
};
