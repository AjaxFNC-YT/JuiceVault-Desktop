import { useTheme } from "@/stores/themeStore";

function Background() {
  const { theme } = useTheme();

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div
        className="absolute inset-0 transition-colors duration-500"
        style={{
          backgroundColor: theme.bg,
          backgroundImage: theme.gradients.join(", ") || "none",
        }}
      />
    </div>
  );
}

export default Background;
