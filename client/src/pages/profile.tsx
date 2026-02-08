import { useAuth } from "@/lib/clerkAuth";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { useLocation } from "wouter";

type DbUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  degree: string | null;
  className: string | null;
};

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { data: dbUser } = useQuery<DbUser>({
    queryKey: ["/api/auth/user"],
    enabled: isAuthenticated,
  });
  const [degree, setDegree] = useState("");
  const [className, setClassName] = useState("");
  const initializedFromUser = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }

    if (dbUser && !initializedFromUser.current) {
      setDegree(dbUser.degree || "");
      setClassName(dbUser.className || "");
      initializedFromUser.current = true;
    }
  }, [isAuthenticated, isLoading, dbUser, toast]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { degree: string; className: string }) => {
      const res = await apiRequest("PATCH", "/api/user/profile", data);
      return res.json() as Promise<DbUser>;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<DbUser>(["/api/auth/user"], updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      setLocation("/");
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!degree.trim() || !className.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }
    updateProfileMutation.mutate({ degree: degree.trim(), className: className.trim() });
  };

  if (isLoading || (isAuthenticated && dbUser === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const displayEmail = dbUser?.email ?? user.email ?? "";

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <User className="h-8 w-8 text-primary" />
        <h1 className="font-heading font-bold text-3xl" data-testid="text-profile-title">
          Complete Your Profile
        </h1>
      </div>

      <Card className="p-6" data-testid="card-profile-form">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={displayEmail}
              disabled
              className="bg-muted"
              data-testid="input-email"
            />
          </div>

          <div>
            <Label htmlFor="degree">Degree / Program *</Label>
            <Input
              id="degree"
              type="text"
              value={degree}
              onChange={(e) => setDegree(e.target.value)}
              placeholder="e.g., Computer Science, Business Administration"
              required
              data-testid="input-degree"
            />
          </div>

          <div>
            <Label htmlFor="className">Class / Year *</Label>
            <Input
              id="className"
              type="text"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
              placeholder="e.g., Freshman, Sophomore, Junior, Senior, Graduate"
              required
              data-testid="input-class"
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="flex-1"
              data-testid="button-save-profile"
            >
              {updateProfileMutation.isPending ? "Saving..." : "Save Profile"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/")}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
