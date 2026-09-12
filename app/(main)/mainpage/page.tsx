"use client";
import { useEffect, useState } from 'react';
import { useTransitionRouter } from "next-transition-router";
interface User { _id?: string; name: string; email: string; createdAt?: string; }
export default function MainPage() {
  const router = useTransitionRouter();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const userStr = localStorage.getItem('hmtyauth_user');
    if (userStr) setUser(JSON.parse(userStr));
    else router.push('/mainauth');
  }, [router]);
  const handleLogout = () => {
    localStorage.removeItem('hmtyauth_user');
    localStorage.removeItem('hmtyauth_logged');
    router.push('/mainauth');
  };

  //hola
  //commit
  if (!user) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-500">Cargando perfil...</div></div>;
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-lg">{user.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-800">{user.name}</h1>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md font-medium transition-colors text-sm">Cerrar sesion</button>
            </div>
          </div>
        </div>
      </header>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Bienvenido, {user.name}!</h2>
          <p className="text-gray-600 mb-6">Tu cuenta fue creada el <strong>{user.createdAt ? formatDate(user.createdAt) : 'recientemente'}</strong>.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-green-50 rounded-lg p-4 text-center"><div className="text-3xl font-bold text-green-600">0</div><div className="text-sm text-green-700 mt-1">Facturas analizadas</div></div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center"><div className="text-3xl font-bold text-yellow-600">0</div><div className="text-sm text-yellow-700 mt-1">Alertas detectadas</div></div>
            <div className="bg-blue-50 rounded-lg p-4 text-center"><div className="text-3xl font-bold text-blue-600">0%</div><div className="text-sm text-blue-700 mt-1">Tasa de fraude</div></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Acciones Rapidas</h3>
          <div className="space-y-3">
            <button className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-md font-medium transition-colors">Subir nueva factura</button>
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-md font-medium transition-colors">Revisar alertas</button>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6 mt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Configuracion</h3>
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <div className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-600">Nombre</label><p className="text-gray-800">{user.name}</p></div>
              <div><label className="block text-sm font-medium text-gray-600">Correo</label><p className="text-gray-800">{user.email}</p></div>
              <div><label className="block text-sm font-medium text-gray-600">Fecha de registro</label><p className="text-gray-800">{user.createdAt ? formatDate(user.createdAt) : 'Recientemente'}</p></div>
            </div>
            <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-md font-medium transition-colors">Cerrar Sesion</button>
          </div>
        </div>
      </div>
    </main>
  );
}
