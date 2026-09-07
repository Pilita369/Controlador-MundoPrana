import { ReactNode, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Receipt, Wallet, Package, CalendarDays, ChefHat, Calculator, Landmark, TrendingUp, BarChart3, Users, Settings, LogOut, Menu as MenuIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// Todos los items: se muestran completos en el sidebar de escritorio.
const navItems = [
  { path: '/', label: 'Inicio', icon: Home },
  { path: '/ventas', label: 'Ventas', icon: ShoppingCart },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/productos', label: 'Productos', icon: Package },
  { path: '/produccion', label: 'Producción', icon: ChefHat },
  { path: '/costos', label: 'Costos', icon: Calculator },
  { path: '/resultado', label: 'Resultado', icon: TrendingUp },
  { path: '/estadisticas', label: 'Estadísticas', icon: BarChart3 },
  { path: '/menus', label: 'Menús', icon: CalendarDays },
  { path: '/gastos', label: 'Gastos', icon: Receipt },
  { path: '/deudas', label: 'Deudas', icon: Landmark },
  { path: '/sueldo', label: 'Mi Sueldo', icon: Wallet },
];

// En el celular solo entran comodamente 4-5: lo que se usa a diario.
// El resto (Menús, Gastos, Sueldo, Ajustes) va detrás de "Más".
const navMobilePrincipal = navItems.filter(i => ['/', '/ventas', '/productos', '/produccion'].includes(i.path));
const navMobileMas = [...navItems.filter(i => !['/', '/ventas', '/productos', '/produccion'].includes(i.path)), { path: '/ajustes', label: 'Ajustes', icon: Settings }];

export default function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [masAbierto, setMasAbierto] = useState(false);

  const enMas = navMobileMas.some(i => i.path === location.pathname);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r bg-card p-4 gap-1">
        <div className="flex items-center gap-2 px-3 py-4 mb-4">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Package className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">Finanzas · Mundo Prana</span>
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
        <div className="max-w-5xl mx-auto p-4 md:p-6">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t flex justify-around py-2 z-50">
        {navMobilePrincipal.map(item => (
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
        <button
          onClick={() => setMasAbierto(true)}
          className={cn(
            'flex flex-col items-center gap-0.5 px-2 py-1 text-xs transition-colors',
            enMas ? 'text-primary font-medium' : 'text-muted-foreground'
          )}
        >
          <MenuIcon className="w-5 h-5" />
          Más
        </button>
      </nav>

      <Sheet open={masAbierto} onOpenChange={setMasAbierto}>
        <SheetContent side="bottom" className="md:hidden rounded-t-xl">
          <SheetHeader><SheetTitle>Más</SheetTitle></SheetHeader>
          <div className="grid grid-cols-4 gap-3 py-4">
            {navMobileMas.map(item => (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); setMasAbierto(false); }}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-lg text-xs',
                  location.pathname === item.path ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent'
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
            <button
              onClick={() => { signOut(); setMasAbierto(false); }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-5 h-5" />
              Salir
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
