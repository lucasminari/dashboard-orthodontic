import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    url_lida: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NÃO LIDA',
    anon_lida: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SIM (tamanho ' + process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length + ')' : 'NÃO LIDA',
    node_env: process.env.NODE_ENV,
  });
}
