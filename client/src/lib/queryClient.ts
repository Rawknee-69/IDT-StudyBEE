import { QueryClient, QueryFunction } from "@tanstack/react-query";


export async function getClerkToken(): Promise<string | null> {
  try {
    
    const clerk = (window as any).Clerk;
    if (clerk?.session) {
      return await clerk.session.getToken();
    }
    return null;
  } catch {
    return null;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = await getClerkToken();
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}


export async function apiGet<T>(url: string): Promise<T> {
  const token = await getClerkToken();
  
  if (!token) {
    throw new Error("Authentication token not available");
  }
  
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
  };
  
  const res = await fetch(url, {
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("401: Unauthorized");
    }
    const errorText = await res.text();
    throw new Error(`Request failed: ${errorText}`);
  }

  return res.json();
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = await getClerkToken();
    const headers: Record<string, string> = {};
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    
    const res = await fetch(queryKey.join("/") as string, {
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
