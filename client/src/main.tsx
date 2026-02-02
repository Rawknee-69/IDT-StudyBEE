import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}


const clerkAppearance = {
  
  baseTheme: undefined,
  variables: {
    colorPrimary: "hsl(84, 81%, 55%)",
    colorText: "hsl(var(--foreground))",
    colorTextSecondary: "hsl(var(--muted-foreground))",
    colorBackground: "hsl(var(--background))",
    colorInputBackground: "hsl(var(--card))",
    colorInputText: "hsl(var(--foreground))",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-heading)",
    fontSize: "0.875rem",
  },
  elements: {
    rootBox: {
      fontFamily: "var(--font-sans)",
    },
    card: {
      backgroundColor: "hsl(var(--card))",
      borderColor: "hsl(var(--border))",
      borderRadius: "var(--radius)",
      boxShadow: "var(--shadow-lg)",
    },
    headerTitle: {
      fontFamily: "var(--font-heading)",
      fontWeight: "700",
      fontSize: "1.5rem",
      color: "hsl(var(--foreground))",
    },
    headerSubtitle: {
      color: "hsl(var(--muted-foreground))",
    },
    socialButtonsBlockButton: {
      backgroundColor: "hsl(var(--card))",
      borderColor: "hsl(var(--border))",
      color: "hsl(var(--foreground))",
      fontFamily: "var(--font-heading)",
      fontWeight: "500",
      borderRadius: "var(--radius)",
      transition: "all 0.2s ease",
    },
    formButtonPrimary: {
      backgroundColor: "hsl(var(--primary))",
      color: "hsl(var(--primary-foreground))",
      fontFamily: "var(--font-heading)",
      fontWeight: "600",
      borderRadius: "var(--radius)",
      transition: "all 0.2s ease",
    },
    formFieldInput: {
      backgroundColor: "hsl(var(--card))",
      borderColor: "hsl(var(--border))",
      color: "hsl(var(--foreground))",
      borderRadius: "var(--radius)",
      transition: "all 0.2s ease",
    },
    formFieldLabel: {
      color: "hsl(var(--foreground))",
      fontFamily: "var(--font-heading)",
      fontWeight: "500",
    },
    footerActionLink: {
      color: "hsl(var(--primary))",
      fontFamily: "var(--font-heading)",
    },
    identityPreviewText: {
      color: "hsl(var(--foreground))",
    },
    identityPreviewEditButton: {
      color: "hsl(var(--primary))",
    },
    formResendCodeLink: {
      color: "hsl(var(--primary))",
    },
    otpCodeFieldInput: {
      backgroundColor: "hsl(var(--card))",
      borderColor: "hsl(var(--border))",
      color: "hsl(var(--foreground))",
      borderRadius: "var(--radius)",
    },
    dividerLine: {
      backgroundColor: "hsl(var(--border))",
    },
    dividerText: {
      color: "hsl(var(--muted-foreground))",
    },
    alertText: {
      color: "hsl(var(--destructive))",
    },
    formFieldErrorText: {
      color: "hsl(var(--destructive))",
    },
    modalContent: {
      backgroundColor: "hsl(var(--background))",
      borderRadius: "var(--radius)",
    },
    modalBackdrop: {
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      backdropFilter: "blur(8px)",
    },
  },
};

createRoot(document.getElementById("root")!).render(
  <ClerkProvider 
    publishableKey={publishableKey}
    appearance={clerkAppearance}
    afterSignInUrl="/"
    afterSignUpUrl="/"
  >
    <App />
  </ClerkProvider>
);
