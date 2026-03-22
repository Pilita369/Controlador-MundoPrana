const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="text-center">
        <div className="mx-auto mb-6 w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center p-3">
          <img
            src="/logo.cuchara.webp"
            alt="Mundo Prana"
            className="w-full h-full object-contain"
          />
        </div>

        <h1 className="text-3xl font-bold mb-2">Mundo Prana</h1>
        <p className="text-muted-foreground">
          Gestión integral de tu negocio
        </p>
      </div>
    </div>
  );
};

export default Index;