import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      status: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      adminFullAccess?: boolean;
      adminAllowedSections?: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    status?: string;
    email?: string;
  }
}

