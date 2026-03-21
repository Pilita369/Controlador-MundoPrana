import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Receipt, Wallet, Package, Settings, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/ventas', label: 'Ventas', icon: ShoppingCart },
  { path: '/gastos', label: 'Gastos', icon: Receipt },
  { path: '/sueldo', label: 'Mi Sueldo', icon: Wallet },
  { path: '/productos', label: 'Productos', icon: Package },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r bg-card p-4 gap-1">
        <div className="flex items-center gap-2 px-3 py-4 mb-4">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Package className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">Mundo Prana</span>
        </div>
        {navItems.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
              location.pathname === item.path
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
        <button
          onClick={() => navigate('/ajustes')}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
            location.pathname === '/ajustes'
              ? 'bg-primary text-primary-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <Settings className="w-4 h-4" />
          Ajustes
        </button>
        <div className="flex-1" />
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors text-left"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pb-20 md:pb-0 overflow-auto">
        <div className="max-w-4xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t flex justify-around py-2 z-50">
        {navItems.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors',
              location.pathname === item.path
                ? 'text-primary font-medium'
                : 'text-muted-foreground'
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
