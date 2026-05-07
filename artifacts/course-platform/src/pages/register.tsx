import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation, useSearch } from "wouter";
import { useRegister, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { GoogleSignInButton, useGoogleConfig } from "@/components/google-sign-in-button";
import { GoogleOAuthProvider } from "@react-oauth/google";

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }),
  phone: z.string()
    .min(10, { message: "Enter a valid 10-digit mobile number." })
    .max(15, { message: "Mobile number is too long." })
    .regex(/^[6-9]\d{9}$/, { message: "Enter a valid Indian mobile number." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
  referralCode: z.string().optional(),
});

export default function Register() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const queryClient = useQueryClient();
  const googleConfig = useGoogleConfig();

  const referralCodeFromUrl = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("ref") || "";
  }, [searchString]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      referralCode: referralCodeFromUrl,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    registerMutation.mutate({ data: values as any }, {
      onSuccess: async (data) => {
        queryClient.setQueryData(getGetMeQueryKey(), data);
        await queryClient.refetchQueries({ queryKey: getGetMeQueryKey() });
        toast({ title: "Account created", description: "Welcome to ClickOcean!" });
        setLocation("/my-courses");
      },
      onError: (error: any) => {
        const msg = error?.response?.data?.error ?? error?.message ?? "Failed to create account.";
        toast({ variant: "destructive", title: "Registration failed", description: msg });
      },
    });
  }

  const card = (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-center">
            Create an account
          </CardTitle>
          <CardDescription className="text-center">
            Enter your details to get started with ClickOcean
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="name@example.com" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobile Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="10-digit mobile number"
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        {...field}
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
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="referralCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Referral Code (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter code if you have one" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full mt-6 cursor-pointer hover:bg-primary/85" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creating account..." : "Create account"}
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
              <GoogleSignInButton mode="signup" />
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Sign in
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
