import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Ventas from "@/pages/Ventas";
import Gastos from "@/pages/Gastos";
import Sueldo from "@/pages/Sueldo";
import Productos from "@/pages/Productos";
import Menus from "@/pages/Menus";
import Produccion from "@/pages/Produccion";
import Costos from "@/pages/Costos";
import Deudas from "@/pages/Deudas";
import Resultado from "@/pages/Resultado";
import Estadisticas from "@/pages/Estadisticas";
import Clientes from "@/pages/Clientes";
import Ajustes from "@/pages/Ajustes";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Cargando...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AuthRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthRoute />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/ventas" element={<ProtectedRoute><Ventas /></ProtectedRoute>} />
            <Route path="/gastos" element={<ProtectedRoute><Gastos /></ProtectedRoute>} />
            <Route path="/sueldo" element={<ProtectedRoute><Sueldo /></ProtectedRoute>} />
            <Route path="/productos" element={<ProtectedRoute><Productos /></ProtectedRoute>} />
            <Route path="/menus" element={<ProtectedRoute><Menus /></ProtectedRoute>} />
            <Route path="/produccion" element={<ProtectedRoute><Produccion /></ProtectedRoute>} />
            <Route path="/costos" element={<ProtectedRoute><Costos /></ProtectedRoute>} />
            <Route path="/deudas" element={<ProtectedRoute><Deudas /></ProtectedRoute>} />
            <Route path="/resultado" element={<ProtectedRoute><Resultado /></ProtectedRoute>} />
            <Route path="/estadisticas" element={<ProtectedRoute><Estadisticas /></ProtectedRoute>} />
            <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
            <Route path="/ajustes" element={<ProtectedRoute><Ajustes /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
