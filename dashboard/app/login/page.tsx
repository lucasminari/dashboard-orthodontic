'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { login } from '@/lib/api-client';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/atencao';

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      await login(email, senha);
      router.replace(next);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha ao entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-100 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
        <h1 className="text-xl font-semibold">Entrar</h1>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Email</label>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Senha</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={senha}
            onChange={e => setSenha(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded py-2 transition"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
