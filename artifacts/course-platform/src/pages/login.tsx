import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth, getPostLoginPath } from "@/lib/auth-context";
import { GoogleSignInButton, useGoogleConfig } from "@/components/google-sign-in-button";
import { GoogleOAuthProvider } from "@react-oauth/google";

const formSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  // (user destructured below alongside isAuthenticated effect for redirect)
  const [showPw, setShowPw] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const googleConfig = useGoogleConfig();

  const { user } = useAuth();
  // If user is already authenticated (e.g. navigated to /login while logged in), redirect them
  useEffect(() => {
    if (isAuthenticated) setLocation(getPostLoginPath(user as any));
  }, [isAuthenticated, user, setLocation]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    loginMutation.mutate({ data: values }, {
      onSuccess: async (data) => {
        setIsRedirecting(true);
        // 1. Immediately set auth state so ProtectedRoute sees isAuthenticated = true.
        //    The login response wraps the user in `{ user, message }`, so unwrap it.
        const userData = (data as any)?.user ?? data;
        queryClient.setQueryData(getGetMeQueryKey(), userData);
        // 2. Wait for a fresh server refetch — this gets accurate emailVerified status,
        //    isStaff and staffPermissions, and eliminates timing races with ProtectedRoute.
        await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
        // 3. Compute landing path from the freshly-fetched user (admin → /admin,
        //    staff → first allowed admin page, others → /my-courses).
        const fresh = queryClient.getQueryData(getGetMeQueryKey()) as any;
        setLocation(getPostLoginPath(fresh ?? userData));
      },
      onError: (error: any) => {
        setIsRedirecting(false);
        const msg = error?.response?.data?.error ?? error?.message ?? "Invalid email or password.";
        toast({ variant: "destructive", title: "Sign in failed", description: msg });
      },
    });
  }

  const card = (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-background">
      <Card className="w-full max-w-md bg-card border-border">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Sign in to Upcalify
          </CardTitle>
          <CardDescription>
            Enter your email and password to access your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="name@example.com"
                        autoComplete="email"
                        {...field}
                        className="bg-background"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPw ? "text" : "password"}
                          autoComplete="current-password"
                          {...field}
                          className="bg-background pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full mt-4 bg-primary gap-2 cursor-pointer hover:bg-primary/85"
                disabled={loginMutation.isPending || isRedirecting}
              >
                {(loginMutation.isPending || isRedirecting) && <Loader2 className="w-4 h-4 animate-spin" />}
                {loginMutation.isPending ? "Signing in…" : isRedirecting ? "Loading…" : "Sign in"}
              </Button>
            </form>
          </Form>
          {googleConfig?.enabled && googleConfig?.clientId && (
            <div className="mt-4 space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>
              <GoogleSignInButton mode="signin" />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
  if (googleConfig?.enabled && googleConfig?.clientId) {
    return <GoogleOAuthProvider clientId={googleConfig.clientId}>{card}</GoogleOAuthProvider>;
  }
  return card;
}
