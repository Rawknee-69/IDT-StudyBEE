import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";

export function useAuth() {
  const { userId, isLoaded: authLoaded } = useClerkAuth();
  const { user, isLoaded: userLoaded } = useUser();

  return {
    user: user
      ? {
          id: user.id,
          email: user.emailAddresses[0]?.emailAddress || "",
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.imageUrl,
        }
      : null,
    isLoading: !authLoaded || !userLoaded,
    isAuthenticated: !!userId,
  };
}


