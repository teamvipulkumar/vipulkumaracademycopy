import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useAdminBase } from "@/lib/auth-context";
import { Mail, Send, FileText, Users, BarChart2, Plus, Trash2, Edit2, Check, X, Info, RefreshCw, Eye, Zap, Server, TestTube, CheckCircle2, AlertCircle, Loader2, Wand2, List, UserPlus, RotateCcw, Search, ChevronLeft, Tag, GitBranch, Calendar, Clock, ChevronRight, Play, Pause, ArrowRight, Filter, ShieldCheck, ShoppingCart, Flag, Minus, BookOpen, GraduationCap, UserCheck, Gift, XCircle, BookMarked, MousePointerClick, LogIn, KeyRound, MoreVertical, ArrowUpDown, Pencil, TrendingUp, Sparkles, FileCheck, BadgeCheck, FileX } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { EmailBlockBuilder } from "@/components/email-block-builder";

const API_BASE = import.meta.env.VITE_API_URL ?? "";
async function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API_BASE}${path}`, { credentials: "include", ...opts });
}

// Safely parse a fetch response as JSON. Returns `fallback` if the body is
// empty, non-JSON, or the request failed (e.g. during API server restarts).
async function safeJson<T = unknown>(r: Response, fallback: T): Promise<T> {
  try {
    const text = await r.text();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

type Tab = "dashboard" | "campaigns" | "sequences" | "automation" | "templates" | "tags" | "subscribers" | "smtp" | "lists" | "logs";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <BarChart2 className="w-4 h-4" /> },
  { id: "campaigns", label: "Campaigns", icon: <Send className="w-4 h-4" /> },
  { id: "sequences", label: "Sequences", icon: <GitBranch className="w-4 h-4" /> },
  { id: "automation", label: "Automation", icon: <Zap className="w-4 h-4" /> },
  { id: "templates", label: "Templates", icon: <FileText className="w-4 h-4" /> },
  { id: "tags", label: "Tags", icon: <Tag className="w-4 h-4" /> },
  { id: "lists", label: "Lists", icon: <List className="w-4 h-4" /> },
  { id: "subscribers", label: "Contacts", icon: <Users className="w-4 h-4" /> },
  { id: "smtp", label: "SMTP", icon: <Server className="w-4 h-4" /> },
  { id: "logs", label: "Email Logs", icon: <Clock className="w-4 h-4" /> },
];

const EVENT_META: Record<string, { label: string; description: string; badge: string }> = {
  welcome:              { label: "Welcome Email",          description: "Fires when a new user registers",              badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  purchase:             { label: "Purchase Confirmation",  description: "Fires after a successful payment",             badge: "bg-green-500/10 text-green-400 border-green-500/20" },
  refund:               { label: "Refund Notification",    description: "Fires when a payment is refunded",             badge: "bg-red-500/10 text-red-400 border-red-500/20" },
  forgot_password:      { label: "Password Reset",         description: "Fires when user requests password reset",      badge: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  completion:           { label: "Course Completion",      description: "Fires when a student completes a course",      badge: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  affiliate_commission: { label: "Affiliate Commission",   description: "Fires when affiliate earns a commission",      badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  staff_welcome:        { label: "Staff Welcome",          description: "Fires when a new staff member is added",       badge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
};

function ew(body: string): string {
  const footer = `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 0 8px;font-family:Arial,Helvetica,sans-serif;"><table cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td style="padding:0 5px;"><a href="#" style="text-decoration:none;display:inline-block;width:30px;height:30px;background:#e2e8f0;border-radius:5px;text-align:center;line-height:30px;font-size:13px;color:#475569;">𝕏</a></td><td style="padding:0 5px;"><a href="#" style="text-decoration:none;display:inline-block;width:30px;height:30px;background:#e2e8f0;border-radius:5px;text-align:center;line-height:30px;font-size:12px;color:#475569;font-weight:700;">in</a></td><td style="padding:0 5px;"><a href="#" style="text-decoration:none;display:inline-block;width:30px;height:30px;background:#e2e8f0;border-radius:5px;text-align:center;line-height:30px;font-size:13px;color:#475569;">▶</a></td><td style="padding:0 5px;"><a href="#" style="text-decoration:none;display:inline-block;width:30px;height:30px;background:#e2e8f0;border-radius:5px;text-align:center;line-height:30px;font-size:13px;color:#475569;">◎</a></td></tr></table><p style="margin:0 0 3px;font-size:12px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;">Sent by <strong>Vipul Kumar Academy</strong></p><p style="margin:0 0 10px;font-size:11px;color:#94a3b8;font-family:Arial,Helvetica,sans-serif;"><a href="mailto:support@vipulkumaracademy.com" style="color:#94a3b8;text-decoration:none;">support@vipulkumaracademy.com</a> &nbsp;·&nbsp; WhatsApp: <a href="https://wa.me/15557485582" style="color:#94a3b8;text-decoration:none;">+15557485582</a></p><a href="#" style="font-size:11px;color:#ef4444;text-decoration:none;">Unsubscribe</a></td></tr></table>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background-color:#f1f5f9;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;"><tr><td align="center"><table cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;"><tr><td align="center" style="padding-bottom:22px;"><a href="{{site_url}}" style="text-decoration:none;display:inline-block;background:#2563eb;border-radius:9px;padding:10px 24px;"><span style="color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:1.5px;">VIPUL KUMAR ACADEMY</span></a></td></tr><tr><td style="background:#ffffff;border-radius:16px;padding:36px 40px;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;">${body}</td></tr><tr><td>${footer}</td></tr></table></td></tr></table></body></html>`;
}

const DEFAULT_TEMPLATES: Record<string, { subject: string; html: string }> = {
  welcome: {
    subject: "Welcome to Vipul Kumar Academy, {{name}}! 🎉",
    html: ew(`<p style="margin:0 0 6px;font-size:15px;color:#111827;line-height:1.5;">Hi <strong>{{name}}</strong>,</p><p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Welcome to <strong>Vipul Kumar Academy</strong>! 🎉 We're thrilled to have you join India's premier business education platform.</p><p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Here's what you now have access to:</p><ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;"><li>In-depth courses on <strong>Affiliate Marketing, E-commerce &amp; Dropshipping</strong></li><li>Real-world case studies and step-by-step lessons</li><li>Earn extra income by joining our <strong>Affiliate Program</strong></li><li>Community support and mentorship resources</li></ul><p style="margin:0 0 10px;font-size:14px;color:#374151;">First, please verify your email to activate your account:</p><table cellpadding="0" cellspacing="0" style="margin:16px 0 24px;"><tr><td style="background:#2563eb;border-radius:8px;padding:13px 30px;"><a href="{{verify_link}}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Verify My Email &rarr;</a></td></tr></table><p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;">Once verified, browse our course catalog and take your first step toward financial independence.</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" /><p style="margin:0;font-size:14px;color:#6b7280;">Happy learning,<br><strong style="color:#374151;">The VKA Team</strong></p>`),
  },
  purchase: {
    subject: "Payment Confirmed — {{course_name}} ✅",
    html: ew(`<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;"><tr><td align="center" style="background:#f0fdf4;border-radius:12px;padding:20px;"><p style="margin:0 0 6px;font-size:36px;line-height:1;">✅</p><h1 style="margin:0;font-size:22px;font-weight:700;color:#15803d;font-family:Arial,Helvetica,sans-serif;">Payment Confirmed!</h1></td></tr></table><p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>, your payment was successful and your course access is now active.</p><table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;"><tr style="background:#f9fafb;"><td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Course</td><td style="padding:11px 16px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{course_name}}</td></tr><tr><td style="padding:11px 16px;color:#6b7280;">Amount Paid</td><td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;">&#8377;{{amount}}</td></tr><tr style="background:#f9fafb;"><td style="padding:11px 16px;color:#6b7280;border-top:1px solid #e5e7eb;">Account Email</td><td style="padding:11px 16px;color:#374151;text-align:right;border-top:1px solid #e5e7eb;">{{email}}</td></tr></table><p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.7;">Your course is now available in your dashboard. Start learning immediately!</p><table cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td style="background:#16a34a;border-radius:8px;padding:13px 30px;"><a href="{{site_url}}/my-courses" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Start Learning &rarr;</a></td></tr></table><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" /><p style="margin:0;font-size:13px;color:#6b7280;">Need help? Email us at <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>`),
  },
  refund: {
    subject: "Refund Processed — {{course_name}}",
    html: ew(`<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;"><tr><td align="center" style="background:#fffbeb;border-radius:12px;padding:20px;"><p style="margin:0 0 6px;font-size:36px;line-height:1;">↩️</p><h1 style="margin:0;font-size:22px;font-weight:700;color:#92400e;font-family:Arial,Helvetica,sans-serif;">Refund Processed</h1></td></tr></table><p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>, we've successfully processed your refund request. Here are the details:</p><table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;"><tr style="background:#f9fafb;"><td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Course</td><td style="padding:11px 16px;color:#111827;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">{{course_name}}</td></tr><tr><td style="padding:11px 16px;color:#6b7280;">Refund Amount</td><td style="padding:11px 16px;color:#b45309;font-weight:700;text-align:right;">&#8377;{{amount}}</td></tr></table><table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;"><tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;"><p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;">&#8987; Please allow <strong>5–7 business days</strong> for the refund to reflect in your original payment method.</p></td></tr></table><p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">We're sorry to see you go. If you faced any issue with the course, we'd love to hear from you — our team is here to help.</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" /><p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reach us at <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>`),
  },
  forgot_password: {
    subject: "Reset Your Vipul Kumar Academy Password 🔐",
    html: ew(`<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;"><tr><td align="center" style="background:#eff6ff;border-radius:12px;padding:20px;"><p style="margin:0 0 6px;font-size:36px;line-height:1;">🔐</p><h1 style="margin:0;font-size:22px;font-weight:700;color:#1d4ed8;font-family:Arial,Helvetica,sans-serif;">Reset Your Password</h1></td></tr></table><p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p><p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">We received a request to reset the password for your account associated with <strong>{{email}}</strong>.</p><p style="margin:0 0 18px;font-size:14px;color:#374151;">Click the button below to set a new password:</p><table cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td style="background:#2563eb;border-radius:8px;padding:13px 30px;"><a href="{{reset_link}}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Reset Password &rarr;</a></td></tr></table><table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;"><tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:14px 16px;"><p style="margin:0;font-size:13px;color:#9a3412;font-family:Arial,Helvetica,sans-serif;">&#9888;&#65039; This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email.</p></td></tr></table><p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Or copy and paste this URL:</p><p style="margin:0 0 20px;font-size:12px;color:#2563eb;word-break:break-all;">{{reset_link}}</p><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" /><p style="margin:0;font-size:13px;color:#6b7280;">Need help? Contact us at <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a></p>`),
  },
  completion: {
    subject: "🎓 Congratulations! You completed {{course_name}}",
    html: ew(`<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;"><tr><td align="center" style="background:#faf5ff;border-radius:12px;padding:24px 20px;"><p style="margin:0 0 6px;font-size:48px;line-height:1;">🎓</p><h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#7c3aed;font-family:Arial,Helvetica,sans-serif;">Course Complete!</h1></td></tr></table><p style="margin:0 0 10px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p><p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Congratulations! 🎉 You've successfully completed:</p><table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;"><tr><td align="center" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:16px 20px;"><p style="margin:0;font-size:17px;font-weight:700;color:#4c1d95;font-family:Arial,Helvetica,sans-serif;">{{course_name}}</p></td></tr></table><p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">You're now part of an elite group of learners who have mastered this curriculum. Be proud of this achievement!</p><ul style="margin:0 0 22px;padding-left:20px;color:#374151;font-size:14px;line-height:2.1;"><li>Explore our other advanced courses</li><li>Share your achievement on social media</li><li>Join our Affiliate Program and earn commissions</li></ul><table cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td style="background:#7c3aed;border-radius:8px;padding:13px 30px;"><a href="{{site_url}}/courses" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Explore More Courses &rarr;</a></td></tr></table><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" /><p style="margin:0;font-size:13px;color:#6b7280;">Questions? Reach us at <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>`),
  },
  staff_welcome: {
    subject: "Welcome to the team, {{name}} — Your VKA Admin Access 🎉",
    html: ew(`<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;"><tr><td align="center" style="background:#eef2ff;border-radius:12px;padding:26px 20px;"><p style="margin:0 0 6px;font-size:48px;line-height:1;">🎉</p><h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#4338ca;font-family:Arial,Helvetica,sans-serif;">Welcome to the Team!</h1><p style="margin:6px 0 0;font-size:13px;color:#4f46e5;font-family:Arial,Helvetica,sans-serif;">You've been added as a staff member at Vipul Kumar Academy</p></td></tr></table><p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p><p style="margin:0 0 18px;font-size:15px;color:#374151;line-height:1.7;">Great news — you now have admin access to the <strong>Vipul Kumar Academy</strong> platform. Below are your account details. Please keep them safe and do not share them with anyone.</p><table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;"><tr style="background:#f9fafb;"><td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:42%;">Name</td><td style="padding:11px 16px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">{{name}}</td></tr><tr><td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Login Email</td><td style="padding:11px 16px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;">{{email}}</td></tr><tr style="background:#f9fafb;"><td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Role</td><td style="padding:11px 16px;color:#4338ca;font-weight:700;border-bottom:1px solid #e5e7eb;">{{role_name}}</td></tr><tr><td style="padding:11px 16px;color:#6b7280;">Temporary Password</td><td style="padding:11px 16px;color:#111827;font-weight:700;font-family:'Courier New',Courier,monospace;letter-spacing:0.5px;">{{password}}</td></tr></table><table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;"><tr><td style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:14px 16px;"><p style="margin:0;font-size:13px;color:#92400e;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">&#128274; <strong>Security tip:</strong> Please change this temporary password right after your first login from your account settings.</p></td></tr></table><p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7;"><strong>Your role gives you access to:</strong></p><p style="margin:0 0 22px;padding:12px 16px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#374151;line-height:1.7;font-family:Arial,Helvetica,sans-serif;">{{permissions_summary}}</p><table cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="background:#4f46e5;border-radius:8px;padding:13px 30px;"><a href="{{login_url}}" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Login to Admin Panel &rarr;</a></td></tr></table><hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 16px;" /><p style="margin:0 0 6px;font-size:13px;color:#6b7280;line-height:1.7;">If you have any questions, please reach out to the admin who invited you, or email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a>.</p><p style="margin:8px 0 0;font-size:14px;color:#6b7280;">Welcome aboard,<br><strong style="color:#374151;">The VKA Team</strong></p>`),
  },
  affiliate_commission: {
    subject: "💰 Commission Earned — ₹{{payout_amount}}",
    html: ew(`<table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;"><tr><td align="center" style="background:#f0fdf4;border-radius:12px;padding:24px 20px;"><p style="margin:0 0 6px;font-size:48px;line-height:1;">💰</p><h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#15803d;font-family:Arial,Helvetica,sans-serif;">Commission Credited!</h1></td></tr></table><p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi <strong>{{name}}</strong>,</p><p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Great news! You've earned a new affiliate commission. Here's a summary:</p><table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:22px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:14px;font-family:Arial,Helvetica,sans-serif;"><tr style="background:#f9fafb;"><td style="padding:11px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Commission Amount</td><td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;font-size:16px;border-bottom:1px solid #e5e7eb;">&#8377;{{commission_amount}}</td></tr><tr><td style="padding:11px 16px;color:#6b7280;">Payout Amount</td><td style="padding:11px 16px;color:#15803d;font-weight:700;text-align:right;">&#8377;{{payout_amount}}</td></tr></table><p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">The amount will be transferred to your bank account within <strong>2–3 business days</strong>. Keep sharing your affiliate link to earn more!</p><table cellpadding="0" cellspacing="0" style="margin-bottom:24px;"><tr><td style="background:#16a34a;border-radius:8px;padding:13px 30px;"><a href="{{site_url}}/affiliate" style="color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">View Affiliate Dashboard &rarr;</a></td></tr></table><hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 16px;" /><p style="margin:0;font-size:13px;color:#6b7280;">Questions? Email <a href="mailto:support@vipulkumaracademy.com" style="color:#2563eb;text-decoration:none;">support@vipulkumaracademy.com</a> or WhatsApp: <a href="https://wa.me/15557485582" style="color:#2563eb;text-decoration:none;">+15557485582</a></p>`),
  },
};

/* ── Variables reference panel ── */
const VARIABLES_BY_TYPE: Record<string, { var: string; desc: string }[]> = {
  welcome:              [{ var: "{{name}}", desc: "Student's full name" }, { var: "{{email}}", desc: "Student's email" }, { var: "{{verify_link}}", desc: "Email verification URL" }],
  purchase:             [{ var: "{{name}}", desc: "Student's full name" }, { var: "{{email}}", desc: "Student's email" }, { var: "{{course_name}}", desc: "Course title" }, { var: "{{amount}}", desc: "Payment amount (₹)" }],
  refund:               [{ var: "{{name}}", desc: "Student's full name" }, { var: "{{email}}", desc: "Student's email" }, { var: "{{course_name}}", desc: "Course title" }, { var: "{{amount}}", desc: "Refunded amount (₹)" }],
  forgot_password:      [{ var: "{{name}}", desc: "User's full name" }, { var: "{{email}}", desc: "User's email" }, { var: "{{reset_link}}", desc: "Password reset URL" }],
  completion:           [{ var: "{{name}}", desc: "Student's full name" }, { var: "{{email}}", desc: "Student's email" }, { var: "{{course_name}}", desc: "Completed course title" }],
  affiliate_commission: [{ var: "{{name}}", desc: "Affiliate's full name" }, { var: "{{email}}", desc: "Affiliate's email" }, { var: "{{payout_amount}}", desc: "Payout amount (₹)" }, { var: "{{commission_amount}}", desc: "Commission amount (₹)" }],
  staff_welcome:        [{ var: "{{name}}", desc: "Staff member's full name" }, { var: "{{email}}", desc: "Staff member's login email" }, { var: "{{role_name}}", desc: "Staff role (e.g. Content Manager)" }, { var: "{{password}}", desc: "Temporary password (or 'unchanged' for existing users)" }, { var: "{{permissions_summary}}", desc: "Comma-separated list of granted permissions" }, { var: "{{login_url}}", desc: "Admin login URL" }],
  affiliate_application_submitted: [{ var: "{{name}}", desc: "Applicant's full name" }, { var: "{{email}}", desc: "Applicant's email" }, { var: "{{site_url}}", desc: "Site URL" }],
  affiliate_application_approved:  [{ var: "{{name}}", desc: "Applicant's full name" }, { var: "{{email}}", desc: "Applicant's email" }, { var: "{{site_url}}", desc: "Site URL" }],
  affiliate_application_rejected:  [{ var: "{{name}}", desc: "Applicant's full name" }, { var: "{{email}}", desc: "Applicant's email" }, { var: "{{rejection_reason}}", desc: "Reason from admin note" }, { var: "{{site_url}}", desc: "Site URL" }],
  campaign:             [{ var: "{{name}}", desc: "Subscriber's full name" }, { var: "{{email}}", desc: "Subscriber's email" }],
  custom:               [{ var: "{{name}}", desc: "User's full name" }, { var: "{{email}}", desc: "User's email" }, { var: "{{course_name}}", desc: "Course title" }, { var: "{{amount}}", desc: "Amount (₹)" }, { var: "{{reset_link}}", desc: "Password reset URL" }, { var: "{{verify_link}}", desc: "Email verification URL" }, { var: "{{payout_amount}}", desc: "Payout amount (₹)" }, { var: "{{commission_amount}}", desc: "Commission amount (₹)" }],
};

function TemplateVariablesPanel({ type, onInsert }: { type: string; onInsert?: (v: string) => void }) {
  const vars = VARIABLES_BY_TYPE[type] ?? VARIABLES_BY_TYPE.custom;
  const [copied, setCopied] = useState<string | null>(null);
  function copyVar(v: string) {
    navigator.clipboard.writeText(v).catch(() => {});
    setCopied(v);
    setTimeout(() => setCopied(null), 1500);
    onInsert?.(v);
  }
  return (
    <div className="p-3 bg-blue-500/5 border border-blue-500/15 rounded-lg space-y-2">
      <p className="text-[11px] font-medium text-blue-400 flex items-center gap-1.5"><Info className="w-3 h-3 flex-shrink-0" />Available variables — click to insert into subject line</p>
      <div className="flex flex-wrap gap-1.5">
        {vars.map(({ var: v, desc }) => (
          <button key={v} onClick={() => copyVar(v)} title={desc}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-blue-500/10 border border-blue-500/20 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200 transition-colors cursor-pointer">
            {copied === v ? <Check className="w-3 h-3 text-green-400" /> : null}
            {v}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Variables are replaced with real data when emails are sent. Test emails use sample values.</p>
    </div>
  );
}

/* ── Stat card ── */
function Stat({ label, value, sub, icon, color = "text-foreground" }: { label: string; value: any; sub?: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── Main CRM Page ── */
export default function AdminCrmPage() {
  const adminBase = useAdminBase();
  const search = useSearch();
  // Read deep-link params on first render: ?tab=automation&funnel=3
  const initialParams = (() => {
    const sp = new URLSearchParams(search);
    const t = sp.get("tab") as Tab | null;
    const validTabs: Tab[] = ["dashboard", "campaigns", "sequences", "automation", "templates", "tags", "subscribers", "smtp", "lists", "logs"];
    const f = sp.get("funnel");
    return {
      tab: t && validTabs.includes(t) ? t : ("dashboard" as Tab),
      funnelId: f && /^\d+$/.test(f) ? Number(f) : null,
    };
  })();
  const [tab, setTab] = useState<Tab>(initialParams.tab);
  // initialFunnelId is captured once; AutomationTab uses it on mount only
  const [initialFunnelId] = useState<number | null>(initialParams.funnelId);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-48 flex-shrink-0 border-r border-border bg-card flex-col">
        <div className="p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <p className="font-semibold text-sm text-foreground">CRM & Email</p>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg text-left transition-colors cursor-pointer ${tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile tabs */}
        <div className="lg:hidden flex-shrink-0 flex overflow-x-auto scrollbar-hide border-b border-border bg-card px-4 gap-1 py-2">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer ${tab === t.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "campaigns" && <CampaignsTab />}
          {tab === "sequences" && <SequencesTab />}
          {tab === "automation" && <AutomationTab initialFunnelId={initialFunnelId} />}
          {tab === "templates" && <TemplatesTab />}
          {tab === "tags" && <TagsTab />}
          {tab === "lists" && <ListsTab />}
          {tab === "subscribers" && <SubscribersTab />}
          {tab === "smtp" && <SmtpTab />}
          {tab === "logs" && <EmailLogsTab />}
        </div>
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════ DASHBOARD ══════════════════════════════════════════════ */
const TYPE_COLORS: Record<string, string> = {
  automation: "#a78bfa",
  campaign:   "#60a5fa",
  manual:     "#34d399",
  test:       "#fbbf24",
  other:      "#94a3b8",
};
const TYPE_LABELS: Record<string, string> = {
  automation: "Automation",
  campaign:   "Campaign",
  manual:     "Manual",
  test:       "Test",
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill ?? p.color }} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.fill ?? p.color }} />
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

function DashboardTab() {
  const [stats, setStats]   = useState<any>(null);
  const [chart, setChart]   = useState<any>(null);
  const [sends, setSends]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c, l] = await Promise.all([
      apiFetch("/api/admin/crm/stats").then(r => r.json()),
      apiFetch("/api/admin/crm/dashboard-chart").then(r => r.json()),
      apiFetch("/api/admin/crm/sends?limit=10").then(r => r.json()),
    ]);
    setStats(s);
    setChart(c);
    setSends(Array.isArray(l?.sends) ? l.sends : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const deliveryRate = chart ? Math.round((chart.totals.sent / Math.max(1, chart.totals.sent + chart.totals.failed)) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">CRM Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Email delivery overview</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Total Subscribers" value={stats?.totalSubscribers ?? 0} icon={<Users className="w-4 h-4 text-blue-400" />} color="text-blue-400" />
            <Stat label="Sent This Month"   value={stats?.sentThisMonth ?? 0}    icon={<Send className="w-4 h-4 text-emerald-400" />} color="text-emerald-400" />
            <Stat label="Campaigns Sent"    value={stats?.campaignsSent ?? 0}    icon={<BarChart2 className="w-4 h-4 text-purple-400" />} color="text-purple-400" />
            <Stat label="Automation Fired"  value={stats?.automationEmailsFired ?? 0} icon={<Zap className="w-4 h-4 text-amber-400" />} color="text-amber-400" />
          </div>

          {/* ── SMTP Status ── */}
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${stats?.smtpConnected ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-red-500/5 border-red-500/20 text-red-400"}`}>
            {stats?.smtpConnected ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
            {stats?.smtpConnected ? "SMTP is enabled — use the SMTP tab to send a test email and verify delivery" : "SMTP is not configured — emails won't be sent. Go to the SMTP tab to set it up."}
          </div>

          {/* ── Charts Row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Daily Bar Chart — takes 2 cols */}
            <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">Email Activity</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sent vs failed — last 30 days</p>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />Sent</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />Failed</span>
                </div>
              </div>
              {chart?.daily?.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <TrendingUp className="w-8 h-8 opacity-30" />
                  <p className="text-sm">No email activity in the last 30 days</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chart?.daily ?? []} barCategoryGap="30%" barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    <Bar dataKey="sent"   name="Sent"   fill="#34d399" radius={[3,3,0,0]} />
                    <Bar dataKey="failed" name="Failed" fill="#f87171" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Right column: Delivery Rate + Type Breakdown */}
            <div className="flex flex-col gap-4">

              {/* Delivery Rate */}
              <div className="bg-card border border-border rounded-2xl p-5 flex-1">
                <p className="text-sm font-semibold text-foreground mb-1">Delivery Rate</p>
                <p className="text-xs text-muted-foreground mb-4">Last 30 days</p>
                <div className="flex items-end gap-3 mb-3">
                  <span className="text-4xl font-bold text-foreground">{deliveryRate}<span className="text-xl text-muted-foreground">%</span></span>
                </div>
                <div className="w-full h-2 bg-muted/30 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${deliveryRate}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 className="w-3 h-3" />{chart?.totals?.sent ?? 0} sent</span>
                  <span className="flex items-center gap-1 text-red-400"><XCircle className="w-3 h-3" />{chart?.totals?.failed ?? 0} failed</span>
                </div>
              </div>

              {/* Email Types */}
              <div className="bg-card border border-border rounded-2xl p-5 flex-1">
                <p className="text-sm font-semibold text-foreground mb-1">Email Types</p>
                <p className="text-xs text-muted-foreground mb-4">All time breakdown</p>
                {chart?.types?.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>
                ) : (
                  <div className="space-y-2.5">
                    {(chart?.types ?? []).slice(0, 5).map((t: any) => {
                      const total = (chart?.types ?? []).reduce((s: number, x: any) => s + x.count, 0);
                      const pct = Math.round((t.count / Math.max(1, total)) * 100);
                      const color = TYPE_COLORS[t.type] ?? TYPE_COLORS.other;
                      return (
                        <div key={t.type}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium text-foreground capitalize">{TYPE_LABELS[t.type] ?? t.type}</span>
                            <span className="text-muted-foreground">{t.count} <span className="text-[10px]">({pct}%)</span></span>
                          </div>
                          <div className="w-full h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Recent Sends ── */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Recent Email Sends</h3>
              <span className="text-xs text-muted-foreground">Last 10</span>
            </div>
            {sends.length === 0 ? (
              <div className="py-14 text-center">
                <Mail className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No emails sent yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sends.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === "sent" ? "bg-emerald-400" : "bg-red-400"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{s.subject || "(no subject)"}</p>
                      <p className="text-xs text-muted-foreground">{s.email} · <span className="capitalize">{s.type}</span></p>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${s.status === "sent" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                      {s.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0 hidden sm:block">
                      {new Date(s.sentAt).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════ SMTP ══════════════════════════════════════════════ */
function SmtpTab() {
  const { toast } = useToast();
  const [smtp, setSmtp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "Primary SMTP", host: "", port: "587", secure: false, username: "", password: "", fromName: "VK Academy", fromEmail: "", isActive: false });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/api/admin/crm/smtp");
    if (res.ok) {
      const data = await res.json();
      if (data) {
        setSmtp(data);
        setForm(f => ({ ...f, name: data.name || "Primary SMTP", host: data.host, port: String(data.port), secure: data.secure, username: data.username, fromName: data.fromName, fromEmail: data.fromEmail, isActive: data.isActive, password: "" }));
        setShowForm(false);
      } else {
        setShowForm(true);
      }
    } else {
      setShowForm(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    const res = await apiFetch("/api/admin/crm/smtp", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, port: parseInt(form.port) || 587 }),
    });
    if (res.ok) {
      toast({ title: "SMTP settings saved!" });
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: err.error ?? "Failed to save", variant: "destructive" });
    }
    setSaving(false);
  };

  const sendTest = async () => {
    if (!testEmail) { toast({ title: "Enter a recipient email", variant: "destructive" }); return; }
    setTesting(true);
    let res: Response;
    if (showForm) {
      // Use live form values (unsaved settings)
      res = await apiFetch("/api/admin/crm/smtp/test-live", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail, host: form.host, port: parseInt(form.port) || 587, secure: form.secure, username: form.username, password: form.password, fromName: form.fromName, fromEmail: form.fromEmail }),
      });
    } else {
      // Use saved DB settings
      res = await apiFetch("/api/admin/crm/smtp/test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmail }),
      });
    }
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast({ title: "Test email sent!", description: `Check ${testEmail}` });
    else toast({ title: data.error ?? "Test failed", variant: "destructive" });
    setTesting(false);
  };

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const PRESETS: { label: string; host: string; port: string; secure: boolean }[] = [
    { label: "Brevo", host: "smtp-relay.brevo.com", port: "587", secure: false },
    { label: "Gmail", host: "smtp.gmail.com", port: "587", secure: false },
    { label: "Outlook", host: "smtp.office365.com", port: "587", secure: false },
    { label: "SendGrid", host: "smtp.sendgrid.net", port: "587", secure: false },
    { label: "Mailgun", host: "smtp.mailgun.org", port: "587", secure: false },
    { label: "Zoho", host: "smtp.zoho.com", port: "587", secure: false },
  ];

  return (
    <div className="max-w-2xl space-y-5">
      <div><h2 className="text-xl font-bold text-foreground">SMTP Configuration</h2><p className="text-sm text-muted-foreground mt-0.5">Connect your email provider to send all platform emails.</p></div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : (
        <>
          {/* Status banner */}
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${smtp?.isActive ? "bg-green-500/5 border-green-500/20 text-green-400" : "bg-amber-500/5 border-amber-500/20 text-amber-400"}`}>
            {smtp?.isActive ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {smtp?.isActive ? "SMTP is active — emails are being sent" : "SMTP is not active. Enable it after saving your settings."}
          </div>

          {/* Saved summary (collapsed view) */}
          {smtp && !showForm && (
            <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{smtp.name || "Primary SMTP"}</p>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500/15 text-green-400 border border-green-500/30">PRIMARY</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {smtp.host}:{smtp.port} · {smtp.username} · From: {smtp.fromName} &lt;{smtp.fromEmail}&gt;
                </p>
                <div className="flex items-center gap-1.5 text-xs text-green-400 mt-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Password saved securely
                </div>
              </div>
              <Button variant="outline" size="sm" className="flex-shrink-0 gap-1.5" onClick={() => {
                setForm({ name: smtp.name || "Primary SMTP", host: smtp.host, port: String(smtp.port), secure: smtp.secure, username: smtp.username, password: "", fromName: smtp.fromName, fromEmail: smtp.fromEmail, isActive: smtp.isActive });
                setShowForm(true);
              }}>
                <Edit2 className="w-3.5 h-3.5" />
                Edit Settings
              </Button>
            </div>
          )}

          {/* Form (expanded) */}
          {showForm && (
            <>
              {/* Provider presets */}
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs font-medium text-muted-foreground mb-3">Quick presets</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map(p => (
                    <button key={p.label} onClick={() => setForm(f => ({ ...f, host: p.host, port: p.port, secure: p.secure }))}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer">
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Account Name</Label>
                  <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Primary Brevo, Main Gmail" className="bg-background border-border" />
                  <p className="text-[10px] text-muted-foreground">A label to identify this SMTP provider (e.g. "Primary Brevo")</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">SMTP Host</Label>
                    <Input value={form.host} onChange={e => set("host", e.target.value)} placeholder="smtp.gmail.com" className="bg-background border-border" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Port</Label>
                    <Input value={form.port} onChange={e => set("port", e.target.value)} placeholder="587" className="bg-background border-border" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Username / Email</Label>
                    <Input value={form.username} onChange={e => set("username", e.target.value)} placeholder="you@gmail.com" className="bg-background border-border" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Password / App Password</Label>
                    <Input type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder={smtp?.passwordSet ? "Leave blank to keep current" : "Enter password"} className="bg-background border-border" />
                    {smtp?.passwordSet && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Saved — leave blank to keep</p>}
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">From Name</Label>
                    <Input value={form.fromName} onChange={e => set("fromName", e.target.value)} placeholder="VK Academy" className="bg-background border-border" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">From Email</Label>
                    <Input value={form.fromEmail} onChange={e => set("fromEmail", e.target.value)} placeholder="noreply@vkacademy.com" className="bg-background border-border" />
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">Use SSL/TLS (port 465)</p>
                    <p className="text-xs text-muted-foreground">Enable for port 465 — keep off for 587 (STARTTLS)</p>
                  </div>
                  <Switch checked={form.secure} onCheckedChange={v => set("secure", v)} />
                </div>
                <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground">Activate SMTP</p>
                    <p className="text-xs text-muted-foreground">When disabled, no emails will be sent from the platform</p>
                  </div>
                  <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={save} disabled={saving} className="flex-1 bg-primary gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {saving ? "Saving…" : "Save SMTP Settings"}
                  </Button>
                  {smtp && (
                    <Button variant="outline" onClick={() => {
                      setForm({ name: smtp.name || "Primary SMTP", host: smtp.host, port: String(smtp.port), secure: smtp.secure, username: smtp.username, password: "", fromName: smtp.fromName, fromEmail: smtp.fromEmail, isActive: smtp.isActive });
                      setShowForm(false);
                    }} disabled={saving}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Test send — always visible */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><TestTube className="w-4 h-4 text-primary" />Send Test Email</h3>
            {!smtp ? (
              <p className="text-xs text-amber-400 flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />Save your SMTP settings above first before sending a test email.</p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" className="bg-background border-border flex-1" />
                  <Button onClick={sendTest} disabled={testing} variant="outline" className="gap-1.5 flex-shrink-0">
                    {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Send
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Info className="w-3 h-3 flex-shrink-0" />
                  {showForm ? "Tests with the values currently in the form above (not yet saved)" : "Tests with your saved SMTP settings"}
                </p>
              </>
            )}
          </div>

          {/* Backup SMTP Accounts */}
          <BackupSmtpAccounts onPrimaryChanged={load} />
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════ BACKUP SMTP ACCOUNTS ══════════════════════════════════════════════ */
const SMTP_PRESETS = [
  { label: "Brevo", host: "smtp-relay.brevo.com", port: "587", secure: false },
  { label: "Gmail", host: "smtp.gmail.com", port: "587", secure: false },
  { label: "Outlook", host: "smtp.office365.com", port: "587", secure: false },
  { label: "SendGrid", host: "smtp.sendgrid.net", port: "587", secure: false },
  { label: "Mailgun", host: "smtp.mailgun.org", port: "587", secure: false },
  { label: "Zoho", host: "smtp.zoho.com", port: "587", secure: false },
];

const emptyBackupForm = () => ({ name: "", host: "", port: "587", secure: false, username: "", password: "", fromName: "", fromEmail: "", priority: "2", isActive: true });

function BackupSmtpAccounts({ onPrimaryChanged }: { onPrimaryChanged?: () => void }) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [form, setForm] = useState(emptyBackupForm());

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/api/admin/crm/smtp/accounts");
    if (r.ok) setAccounts(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.host.trim() || !form.username.trim()) { toast({ title: "Host and username are required", variant: "destructive" }); return; }
    if (!editing && !form.password.trim()) { toast({ title: "Password is required for new accounts", variant: "destructive" }); return; }
    setSaving(true);
    if (editing) {
      const r = await apiFetch(`/api/admin/crm/smtp/accounts/${editing.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: parseInt(form.port) || 587, priority: parseInt(form.priority) || 1 }),
      });
      if (r.ok) { toast({ title: "Backup SMTP updated" }); setEditing(null); load(); }
      else { const e = await r.json().catch(() => ({})); toast({ title: e.error ?? "Failed to save", variant: "destructive" }); }
    } else {
      const r = await apiFetch("/api/admin/crm/smtp/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, port: parseInt(form.port) || 587, priority: parseInt(form.priority) || 1 }),
      });
      if (r.ok) { toast({ title: "Backup SMTP added" }); setAdding(false); setForm(emptyBackupForm()); load(); }
      else { const e = await r.json().catch(() => ({})); toast({ title: e.error ?? "Failed to add", variant: "destructive" }); }
    }
    setSaving(false);
  };

  const del = async (id: number) => {
    if (!confirm("Remove this backup SMTP account?")) return;
    setDeleting(id);
    await apiFetch(`/api/admin/crm/smtp/accounts/${id}`, { method: "DELETE" });
    toast({ title: "Backup SMTP removed" }); load();
    setDeleting(null);
  };

  const promoteAccount = async (acc: any) => {
    if (!confirm(`Set "${acc.name}" as the new Primary SMTP? The current primary will become a backup.`)) return;
    setPromotingId(acc.id);
    const r = await apiFetch(`/api/admin/crm/smtp/accounts/${acc.id}/promote`, { method: "POST" });
    if (r.ok) {
      toast({ title: `"${acc.name}" is now the Primary SMTP`, description: "The previous primary has been moved to backups." });
      load();
      onPrimaryChanged?.();
    } else {
      const e = await r.json().catch(() => ({}));
      toast({ title: e.error ?? "Failed to promote", variant: "destructive" });
    }
    setPromotingId(null);
  };

  const testAccount = async (id: number) => {
    if (!testEmail.trim()) { toast({ title: "Enter a recipient email first", variant: "destructive" }); return; }
    setTestingId(id);
    const r = await apiFetch(`/api/admin/crm/smtp/accounts/${id}/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: testEmail }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok) toast({ title: "Test email sent!", description: `Check ${testEmail}` });
    else toast({ title: data.error ?? "Test failed", variant: "destructive" });
    setTestingId(null); load();
  };

  return (
    <div className="border-t border-border pt-6 space-y-5 mt-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />Backup SMTP Accounts</h3>
          <p className="text-sm text-muted-foreground mt-0.5">If your primary SMTP fails, these accounts are tried in priority order as fallbacks.</p>
        </div>
        {!adding && !editing && (
          <Button size="sm" className="gap-1.5 flex-shrink-0 cursor-pointer" onClick={() => setAdding(true)}><Plus className="w-4 h-4" />Add Backup</Button>
        )}
      </div>

      <div className="p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl text-xs text-blue-400 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>The system sends via your <strong>primary SMTP</strong> above. If that fails, it automatically tries each backup in order of priority (lowest number first) until one succeeds.</span>
      </div>

      {(adding || editing) && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold">{editing ? `Edit: ${editing.name}` : "Add Backup SMTP Account"}</p>

          <div>
            <p className="text-xs text-muted-foreground mb-2">Quick presets</p>
            <div className="flex flex-wrap gap-2">
              {SMTP_PRESETS.map(p => (
                <button key={p.label} onClick={() => setForm(f => ({ ...f, host: p.host, port: p.port, secure: p.secure, name: f.name || p.label }))}
                  className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors cursor-pointer">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Account Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Backup Brevo" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priority (1 = highest)</Label>
              <Input type="number" min={1} value={form.priority} onChange={e => set("priority", e.target.value)} className="h-9" />
              <p className="text-[10px] text-muted-foreground">Lower number = tried first after primary fails</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">SMTP Host *</Label>
              <Input value={form.host} onChange={e => set("host", e.target.value)} placeholder="smtp.brevo.com" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Port</Label>
              <Input value={form.port} onChange={e => set("port", e.target.value)} placeholder="587" className="h-9" />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Username / Email *</Label>
              <Input value={form.username} onChange={e => set("username", e.target.value)} placeholder="you@domain.com" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Password {editing ? "(leave blank to keep)" : "*"}</Label>
              <Input type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder={editing ? "Leave blank to keep current" : "Enter password"} className="h-9" />
              {editing?.passwordSet && !form.password && <p className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Saved — leave blank to keep</p>}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From Name</Label>
              <Input value={form.fromName} onChange={e => set("fromName", e.target.value)} placeholder="VK Academy" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From Email</Label>
              <Input value={form.fromEmail} onChange={e => set("fromEmail", e.target.value)} placeholder="noreply@domain.com" className="h-9" />
            </div>
          </div>
          <div className="flex items-center justify-between p-3 bg-background rounded-lg border border-border">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">When disabled, this backup won't be used as a fallback</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={v => set("isActive", v)} />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 p-3 bg-background rounded-lg border border-border">
              <span className="text-sm font-medium">SSL/TLS</span>
              <Switch checked={form.secure} onCheckedChange={v => set("secure", v)} />
            </div>
            <div className="flex gap-2 flex-1">
              <Button onClick={save} disabled={saving} className="flex-1 gap-2 cursor-pointer">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {saving ? "Saving…" : editing ? "Update Account" : "Add Account"}
              </Button>
              <Button variant="outline" className="cursor-pointer" onClick={() => { setAdding(false); setEditing(null); setForm(emptyBackupForm()); }} disabled={saving}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : accounts.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-xl py-10 text-center">
          <Server className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium mb-1">No backup SMTPs configured</p>
          <p className="text-xs text-muted-foreground mb-3">Add a backup SMTP to ensure email delivery even if your primary fails.</p>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1.5 cursor-pointer"><Plus className="w-4 h-4" />Add Backup SMTP</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Test email input shared across all accounts */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <TestTube className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="Enter email to test any backup account…" className="pl-9 h-9 text-sm bg-background" />
            </div>
          </div>
          {accounts.map(acc => (
            <div key={acc.id} className={`bg-card border rounded-xl p-4 transition-colors ${acc.isActive ? "border-border" : "border-dashed border-border opacity-60"}`}>
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${acc.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {acc.priority}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{acc.name}</p>
                    {acc.isActive ? (
                      <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30 bg-green-400/5">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">Disabled</Badge>
                    )}
                    {acc.lastError && (
                      <Badge variant="outline" className="text-[10px] text-red-400 border-red-400/30 bg-red-400/5 max-w-[180px] truncate" title={acc.lastError}>Last error</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{acc.host}:{acc.port} · {acc.username}</p>
                  <p className="text-xs text-muted-foreground">From: {acc.fromName} &lt;{acc.fromEmail}&gt;</p>
                  {acc.lastError && <p className="text-[11px] text-red-400 mt-1 line-clamp-1" title={acc.lastError}>⚠ {acc.lastError}</p>}
                  {acc.lastTestedAt && !acc.lastError && <p className="text-[11px] text-green-400 mt-0.5">✓ Last tested: {new Date(acc.lastTestedAt).toLocaleString()}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1 cursor-pointer border-primary/30 text-primary hover:bg-primary/10" disabled={promotingId === acc.id} onClick={() => promoteAccount(acc)} title="Make this the primary SMTP">
                    {promotingId === acc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}Set Primary
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1 cursor-pointer" disabled={testingId === acc.id} onClick={() => testAccount(acc.id)}>
                    {testingId === acc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}Test
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0 cursor-pointer" onClick={() => {
                    setEditing(acc);
                    setForm({ name: acc.name, host: acc.host, port: String(acc.port), secure: acc.secure, username: acc.username, password: "", fromName: acc.fromName, fromEmail: acc.fromEmail, priority: String(acc.priority), isActive: acc.isActive });
                    setAdding(false);
                  }}>
                    <Edit2 className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer" disabled={deleting === acc.id} onClick={() => del(acc.id)}>
                    {deleting === acc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════ TEMPLATES ══════════════════════════════════════════════ */
function TemplatesTab() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [previewing, setPreviewing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", type: "custom", subject: "", htmlBody: "", isActive: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch("/api/admin/crm/templates");
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing("new");
    setForm({ name: "", type: "custom", subject: "", htmlBody: "", isActive: true });
  };
  const openEdit = (t: any) => {
    setEditing(t.id);
    setForm({ name: t.name, type: t.type, subject: t.subject, htmlBody: t.htmlBody, isActive: t.isActive });
  };
  const applyDefault = (type: string) => {
    const d = DEFAULT_TEMPLATES[type];
    if (d) setForm(f => ({ ...f, subject: d.subject, htmlBody: d.html }));
  };

  const seedDefaults = async () => {
    setSeeding(true);
    const res = await apiFetch("/api/admin/crm/templates/seed-defaults", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      if (data.created === 0) {
        toast({ title: "Already up to date", description: "All default templates already exist." });
      } else {
        toast({ title: `${data.created} template${data.created > 1 ? "s" : ""} created!`, description: "Default templates for all events are ready." });
        load();
      }
    } else {
      toast({ title: "Failed to seed templates", variant: "destructive" });
    }
    setSeeding(false);
  };

  const save = async () => {
    if (!form.name || !form.subject || !form.htmlBody) { toast({ title: "Fill all fields", variant: "destructive" }); return; }
    setSaving(true);
    const url = editing === "new" ? "/api/admin/crm/templates" : `/api/admin/crm/templates/${editing}`;
    const method = editing === "new" ? "POST" : "PUT";
    const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) {
      toast({ title: editing === "new" ? "Template created!" : "Template saved!" });
      setEditing(null); load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast({ title: e.error ?? "Failed", variant: "destructive" });
    }
    setSaving(false);
  };

  const del = async (id: number) => {
    setDeleting(id);
    await apiFetch(`/api/admin/crm/templates/${id}`, { method: "DELETE" });
    toast({ title: "Template deleted" });
    load(); setDeleting(null);
  };

  const sendTest = async () => {
    if (!testEmail) { toast({ title: "Enter a recipient email", variant: "destructive" }); return; }
    if (!form.subject) { toast({ title: "Add a subject line first", variant: "destructive" }); return; }
    if (!form.htmlBody) { toast({ title: "Email body is empty", variant: "destructive" }); return; }
    setTestSending(true);
    const res = await apiFetch("/api/admin/crm/templates/test-send", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testEmail, subject: form.subject, htmlBody: form.htmlBody }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) toast({ title: "Test email sent!", description: `Check ${testEmail} — subject: [TEST] ${form.subject}` });
    else toast({ title: data.error ?? "Failed to send", variant: "destructive" });
    setTestSending(false);
  };

  if (editing !== null) {
    return (
      <div className="space-y-5 max-w-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"><X className="w-4 h-4" /></button>
          <h2 className="text-xl font-bold text-foreground">{editing === "new" ? "New Template" : "Edit Template"}</h2>
        </div>

        {/* Meta fields */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Template Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Welcome Email" className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <select value={form.type} onChange={e => { setForm(f => ({ ...f, type: e.target.value })); applyDefault(e.target.value); }}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                <option value="custom">Custom</option>
                <option value="welcome">Welcome</option>
                <option value="purchase">Purchase Confirmation</option>
                <option value="refund">Refund</option>
                <option value="forgot_password">Forgot Password</option>
                <option value="completion">Course Completion</option>
                <option value="affiliate_commission">Affiliate Commission</option>
                <option value="affiliate_application_submitted">Affiliate Application — Submitted</option>
                <option value="affiliate_application_approved">Affiliate Application — Approved</option>
                <option value="affiliate_application_rejected">Affiliate Application — Rejected</option>
                <option value="staff_welcome">Staff Welcome</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Subject Line</Label>
              <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Welcome to VK Academy, {{name}}!" className="bg-background border-border" />
            </div>
          </div>
          <TemplateVariablesPanel type={form.type} onInsert={v => setForm(f => ({ ...f, subject: f.subject + v }))} />
        </div>

        {/* Block email builder */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Email Body</Label>
          <EmailBlockBuilder
            value={form.htmlBody}
            onChange={html => setForm(f => ({ ...f, htmlBody: html }))}
          />
        </div>

        {/* Send Test Email */}
        <div className="bg-card border border-amber-500/20 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TestTube className="w-4 h-4 text-amber-400" />
            Send Test Email
            <span className="text-[10px] font-normal text-muted-foreground ml-1">— sends the current template as-is (before saving)</span>
          </h3>
          <div className="flex gap-2">
            <Input
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder="your@email.com"
              type="email"
              className="bg-background border-border flex-1"
              onKeyDown={e => { if (e.key === "Enter") sendTest(); }}
            />
            <Button onClick={sendTest} disabled={testSending} variant="outline" className="gap-1.5 flex-shrink-0 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-400">
              {testSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {testSending ? "Sending…" : "Send Test"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Info className="w-3 h-3 flex-shrink-0" />
            The test email is sent with subject prefixed <code className="font-mono bg-muted px-1 rounded">[TEST]</code> — you don't need to save first
          </p>
        </div>

        {/* Footer actions */}
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-foreground">Active</p>
            <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="bg-primary gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Template"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-foreground">Email Templates</h2><p className="text-sm text-muted-foreground mt-0.5">Reusable HTML email templates for campaigns and automation.</p></div>
        <div className="flex items-center gap-2">
          <Button onClick={seedDefaults} disabled={seeding} variant="outline" size="sm" className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10">
            {seeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            Seed Defaults
          </Button>
          <Button onClick={openNew} size="sm" className="bg-primary gap-1.5"><Plus className="w-4 h-4" />New Template</Button>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        : templates.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl py-20 text-center">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">No templates yet</p>
            <p className="text-sm text-muted-foreground mb-4">Seed all 6 default event templates in one click, or create your own.</p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={seedDefaults} disabled={seeding} size="sm" className="bg-primary gap-1.5">
                {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {seeding ? "Creating…" : "Seed Default Templates"}
              </Button>
              <Button onClick={openNew} variant="outline" size="sm" className="gap-1.5"><Plus className="w-4 h-4" />Create Manually</Button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-foreground truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t.subject}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] capitalize flex-shrink-0 ${t.isActive ? "text-green-400 border-green-400/30" : "text-muted-foreground"}`}>
                    {t.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <Badge variant="outline" className="text-[10px] w-fit border-border text-muted-foreground capitalize">{t.type.replace("_", " ")}</Badge>
                <div className="flex gap-2 mt-auto">
                  <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => openEdit(t)}><Edit2 className="w-3 h-3" />Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1 text-xs" onClick={() => setPreviewing(t.htmlBody)}><Eye className="w-3 h-3" />Preview</Button>
                  <Button variant="outline" size="sm" className="text-red-400 hover:text-red-400 border-red-500/20 hover:bg-red-500/5" disabled={deleting === t.id} onClick={() => del(t.id)}>
                    {deleting === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Email Preview</h3>
              <button onClick={() => setPreviewing(null)} className="cursor-pointer"><X className="w-4 h-4 text-muted-foreground hover:text-foreground" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <iframe srcDoc={previewing} className="w-full min-h-[480px] rounded-lg border border-border bg-white" title="preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════ AUTOMATION ══════════════════════════════════════════════ */

const FUNNEL_TRIGGERS = [
  /* ── User lifecycle ── */
  { type: "user_signup",        label: "User Signs Up",          icon: UserPlus,           color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    desc: "Fires when a new user registers an account" },
  { type: "user_login",         label: "User Logs In",           icon: LogIn,              color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/20",     desc: "Fires each time a user signs in" },
  { type: "forgot_password",    label: "Forgot Password",        icon: KeyRound,           color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   desc: "Fires when a user requests a password reset" },
  { type: "staff_added",        label: "Staff Member Added",     icon: ShieldCheck,        color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/20",  desc: "Fires when a new staff member is added to the platform" },
  /* ── Creators ── */
  { type: "creator_joined",     label: "User Becomes Creator",   icon: Sparkles,           color: "text-fuchsia-400", bg: "bg-fuchsia-500/10", border: "border-fuchsia-500/20", desc: "Fires when an admin grants a user creator access" },
  { type: "creator_commission_earned", label: "Creator Sale / Commission", icon: TrendingUp,    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", desc: "Fires when a creator earns a commission from a course sale" },
  { type: "creator_payout_paid",       label: "Creator Payout Sent",      icon: Send,          color: "text-lime-400",    bg: "bg-lime-500/10",    border: "border-lime-500/20",    desc: "Fires when an admin marks a creator's payout as paid" },
  { type: "creator_kyc_submitted",     label: "Creator KYC Submitted",    icon: FileCheck,     color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    desc: "Fires when a creator submits or resubmits their KYC documents" },
  { type: "creator_kyc_approved",      label: "Creator KYC Approved",     icon: BadgeCheck,    color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20",   desc: "Fires when an admin approves a creator's KYC" },
  { type: "creator_kyc_rejected",      label: "Creator KYC Rejected",     icon: FileX,         color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     desc: "Fires when an admin rejects a creator's KYC" },
  /* ── Purchases & payments ── */
  { type: "new_purchase",       label: "Purchase Completed",     icon: ShoppingCart,       color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20",   desc: "Fires when any course purchase succeeds" },
  { type: "payment_failed",     label: "Payment Failed",         icon: XCircle,            color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     desc: "Fires when a payment attempt fails" },
  { type: "coupon_used",        label: "Coupon Redeemed",        icon: Gift,               color: "text-pink-400",    bg: "bg-pink-500/10",    border: "border-pink-500/20",    desc: "Fires when a coupon code is applied at checkout" },
  /* ── Course & lesson events ── */
  { type: "course_enrolled",    label: "Course Enrolled",        icon: BookOpen,           color: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/20",    desc: "Fires when a user gains access to a course" },
  { type: "course_completed",   label: "Course Completed",       icon: GraduationCap,      color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", desc: "Fires when a user finishes all lessons in a course" },
  { type: "lesson_completed",   label: "Lesson Completed",       icon: BookMarked,         color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    desc: "Fires when a user marks a lesson as complete" },
  /* ── CRM events ── */
  { type: "tag_applied",        label: "Tag Applied",            icon: Tag,                color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20",  desc: "Fires when a specific tag is applied to a contact" },
  { type: "list_added",         label: "Added to List",          icon: List,               color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   desc: "Fires when a contact is added to a list" },
  /* ── Affiliate ── */
  { type: "affiliate_joined",                  label: "Affiliate Joined",       icon: UserCheck,    color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/20",  desc: "Fires when a user is approved as an affiliate" },
  { type: "affiliate_commission",              label: "Commission Earned",      icon: TrendingUp,   color: "text-yellow-400",  bg: "bg-yellow-500/10",  border: "border-yellow-500/20",  desc: "Fires when an affiliate earns a commission from a referral purchase" },
  { type: "affiliate_application_submitted",   label: "Application Submitted",  icon: Mail,         color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    desc: "Fires when a user submits an affiliate application" },
  { type: "affiliate_application_approved",    label: "Application Approved",   icon: CheckCircle2, color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20",   desc: "Fires when an admin approves an affiliate application" },
  { type: "affiliate_application_rejected",    label: "Application Rejected",   icon: XCircle,      color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     desc: "Fires when an admin rejects an affiliate application" },
  { type: "affiliate_kyc_submitted",           label: "Affiliate KYC Submitted",icon: FileCheck,    color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    desc: "Fires when an affiliate submits or resubmits their KYC documents" },
  { type: "affiliate_kyc_approved",            label: "Affiliate KYC Approved", icon: BadgeCheck,   color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20",   desc: "Fires when an admin approves an affiliate's KYC" },
  { type: "affiliate_kyc_rejected",            label: "Affiliate KYC Rejected", icon: FileX,        color: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/20",     desc: "Fires when an admin rejects an affiliate's KYC" },
  { type: "affiliate_payout_paid",             label: "Affiliate Payout Sent",  icon: Send,         color: "text-lime-400",    bg: "bg-lime-500/10",    border: "border-lime-500/20",    desc: "Fires when an admin marks an affiliate's payout as paid" },
  /* ── Engagement ── */
  { type: "link_clicked",       label: "Email Link Clicked",     icon: MousePointerClick,  color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  desc: "Fires when a contact clicks a tracked link in an email" },
];

const FUNNEL_ACTIONS = [
  { type: "wait",         label: "Wait",             icon: Clock,          color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/20",   desc: "Pause X days / hours" },
  { type: "apply_list",   label: "Apply List",       icon: Plus,           color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/20",    desc: "Add contact to a list" },
  { type: "remove_list",  label: "Remove From List", icon: Minus,          color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/20",    desc: "Remove contact from a list" },
  { type: "apply_tag",    label: "Apply Tag",        icon: Tag,            color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/20",  desc: "Add a tag to the contact" },
  { type: "remove_tag",   label: "Remove Tag",       icon: Tag,            color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/20",  desc: "Remove a tag from the contact" },
  { type: "send_email",   label: "Send Email",       icon: Mail,           color: "text-green-400",   bg: "bg-green-500/10",   border: "border-green-500/20",   desc: "Send custom or template email" },
  { type: "end",          label: "End Funnel",       icon: Flag,           color: "text-muted-foreground", bg: "bg-muted/20", border: "border-border",          desc: "Stop execution for this contact" },
];

function stepSummaryLabel(step: any): string {
  const c: Record<string, any> = step.config ?? {};
  switch (step.actionType) {
    case "wait":        return `Wait ${c.days ?? 0}d ${c.hours ?? 0}h`;
    case "apply_list":  return c.listName ? `Add to "${c.listName}"` : "Add to list (not configured)";
    case "remove_list": return c.listName ? `Remove from "${c.listName}"` : "Remove from list (not configured)";
    case "apply_tag":   return c.tagName  ? `Apply tag "${c.tagName}"` : "Apply tag (not configured)";
    case "remove_tag":  return c.tagName  ? `Remove tag "${c.tagName}"` : "Remove tag (not configured)";
    case "send_email":  return c.mode === "template" ? `Template: ${c.templateName ?? "none"}` : `Subject: ${c.subject ?? ""}`;
    case "end":         return "Funnel ends here";
    default: return "";
  }
}

function AutomationTab({ initialFunnelId = null }: { initialFunnelId?: number | null }) {
  const { toast } = useToast();
  const adminBase = useAdminBase();

  /* ── View state ── */
  const [view, setView] = useState<"list" | "builder">("list");
  const [funnels, setFunnels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* ── Reference data ── */
  const [lists, setLists] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  /* ── Active funnel / builder state ── */
  const [activeFunnelId, setActiveFunnelId] = useState<number | null>(null);
  const [funnelName, setFunnelName] = useState("");
  const [funnelStatus, setFunnelStatus] = useState<"draft" | "published">("draft");
  const [funnelIsActive, setFunnelIsActive] = useState(false);
  const [triggerType, setTriggerType] = useState("user_signup");
  const [triggerConfig, setTriggerConfig] = useState<Record<string, any>>({});
  const [editingTrigger, setEditingTrigger] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const [addingAfterId, setAddingAfterId] = useState<string | null>(null); // "trigger" | `step-${stepId}`
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [stepDraft, setStepDraft] = useState<Record<string, any>>({});

  /* ── Create modal ── */
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("user_signup");
  const [newTriggerCategory, setNewTriggerCategory] = useState("all");

  /* ── Report navigation ── */
  const [, navigate] = useLocation();
  const openReport = useCallback((f: any) => {
    navigate(`${adminBase}/crm/automation/${f.id}/report`);
  }, [navigate, adminBase]);

  /* ── Load ── */
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [f, l, t, tp] = await Promise.all([
      apiFetch("/api/admin/crm/funnels").then(r => safeJson<any[]>(r, [])),
      apiFetch("/api/admin/crm/lists").then(r => safeJson<any[]>(r, [])),
      apiFetch("/api/admin/crm/tags").then(r => safeJson<any[]>(r, [])),
      apiFetch("/api/admin/crm/templates").then(r => safeJson<any[]>(r, [])),
    ]);
    setFunnels(Array.isArray(f) ? f : []);
    setLists(Array.isArray(l) ? l : []);
    setTags(Array.isArray(t) ? t : []);
    setTemplates(Array.isArray(tp) ? tp.filter((x: any) => x.isActive) : []);
    setLoading(false);
    return Array.isArray(f) ? f : [];
  }, []);
  // Auto-open the funnel builder once funnels are loaded if a deep-link funnel id was provided.
  // Use a ref so this only ever fires once per mount (not when user manually closes the builder).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) { loadAll(); return; }
    (async () => {
      const list = await loadAll();
      if (initialFunnelId != null && !autoOpenedRef.current) {
        const f = list.find((x: any) => x.id === initialFunnelId);
        if (f) {
          autoOpenedRef.current = true;
          openFunnel(f);
        }
      }
    })();
  }, [loadAll, initialFunnelId]);

  /* ── Open builder ── */
  const openFunnel = (f: any) => {
    setActiveFunnelId(f.id);
    setFunnelName(f.name);
    setFunnelStatus(f.status);
    setFunnelIsActive(!!f.isActive);
    setTriggerType(f.triggerType);
    setTriggerConfig(f.triggerConfig ?? {});
    setSteps(f.steps ?? []);
    setEditingStepId(null);
    setEditingTrigger(false);
    setAddingAfterId(null);
    setView("builder");
  };

  /* ── Create funnel ── */
  const createFunnel = async () => {
    const trig = FUNNEL_TRIGGERS.find(t => t.type === newTrigger);
    const finalName = newName.trim() || trig?.label || "Untitled Funnel";
    setSaving(true);
    const res = await apiFetch("/api/admin/crm/funnels", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: finalName, triggerType: newTrigger }),
    }).then(r => r.json());
    setSaving(false);
    setShowCreate(false); setNewName(""); setNewTrigger("user_signup");
    setFunnels(prev => [...prev, { ...res, steps: [] }]);
    openFunnel({ ...res, steps: [] });
  };

  /* ── Delete funnel ── */
  const deleteFunnel = async (id: number) => {
    if (!confirm("Delete this automation funnel? This cannot be undone.")) return;
    await apiFetch(`/api/admin/crm/funnels/${id}`, { method: "DELETE" });
    setFunnels(prev => prev.filter(f => f.id !== id));
    if (activeFunnelId === id) { setView("list"); setActiveFunnelId(null); }
    toast({ title: "Funnel deleted" });
  };

  const toggleFunnelActive = async (id: number, currentActive: boolean) => {
    const next = !currentActive;
    const nextStatus = next ? "published" : "draft";
    const prevStatus = currentActive ? "published" : "draft";
    setFunnels(prev => prev.map(f => f.id === id ? { ...f, isActive: next, status: nextStatus } : f));
    if (activeFunnelId === id) { setFunnelIsActive(next); setFunnelStatus(nextStatus); }
    const res = await apiFetch(`/api/admin/crm/funnels/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: next, status: nextStatus }),
    }).then(r => r.json()).catch(() => null);
    if (!res) {
      setFunnels(prev => prev.map(f => f.id === id ? { ...f, isActive: currentActive, status: prevStatus } : f));
      if (activeFunnelId === id) { setFunnelIsActive(currentActive); setFunnelStatus(prevStatus); }
      toast({ title: "Failed to update", variant: "destructive" });
    } else {
      toast({ title: next ? "Automation published" : "Automation set to draft" });
    }
  };

  /* ── Save funnel meta ── */
  const saveMeta = async (patch: Partial<{ name: string; status: string; triggerType: string; triggerConfig: object }>) => {
    if (!activeFunnelId) return;
    setSaving(true);
    const res = await apiFetch(`/api/admin/crm/funnels/${activeFunnelId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(r => r.json());
    setSaving(false);
    setFunnels(prev => prev.map(f => f.id === activeFunnelId ? { ...f, ...res } : f));
    toast({ title: "Saved" });
  };

  /* ── Add step ── */
  const addStep = async (actionType: string) => {
    if (!activeFunnelId) return;
    const defaultConfig: Record<string, any> = actionType === "wait" ? { days: 1, hours: 0 } : actionType === "send_email" ? { mode: "template" } : {};
    let insertAfterOrder = -1;
    if (addingAfterId && addingAfterId.startsWith("step-")) {
      const stepId = parseInt(addingAfterId.replace("step-", ""));
      const s = steps.find(x => x.id === stepId);
      if (s) insertAfterOrder = s.stepOrder;
    } else if (addingAfterId === "trigger") {
      insertAfterOrder = -1;
    } else {
      insertAfterOrder = steps.length > 0 ? steps[steps.length - 1].stepOrder : -1;
    }
    const added = await apiFetch(`/api/admin/crm/funnels/${activeFunnelId}/steps`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actionType, config: defaultConfig, insertAfterOrder }),
    }).then(r => r.json());
    const fresh = await apiFetch(`/api/admin/crm/funnels/${activeFunnelId}`).then(r => r.json());
    setSteps(fresh.steps ?? []);
    setAddingAfterId(null);
    if (actionType !== "end") { setEditingStepId(added.id); setStepDraft({ ...defaultConfig }); }
  };

  /* ── Update step ── */
  const updateStep = async (stepId: number, draft: Record<string, any>) => {
    if (!activeFunnelId) return;
    const { __label, ...config } = draft;
    const labelTrimmed = typeof __label === "string" ? __label.trim() : "";
    await apiFetch(`/api/admin/crm/funnels/${activeFunnelId}/steps/${stepId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, label: labelTrimmed }),
    });
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, config, label: labelTrimmed || null } : s));
    setEditingStepId(null);
    toast({ title: "Step saved" });
  };

  /* ── Delete step ── */
  const deleteStep = async (stepId: number) => {
    if (!activeFunnelId) return;
    await apiFetch(`/api/admin/crm/funnels/${activeFunnelId}/steps/${stepId}`, { method: "DELETE" });
    setSteps(prev => prev.filter(s => s.id !== stepId));
    if (editingStepId === stepId) setEditingStepId(null);
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  /* ════════════ ACTION PICKER (shared snippet) ════════════ */
  const ActionPicker = ({ afterId }: { afterId: string }) => addingAfterId === afterId ? (
    <div className="w-full my-1 p-3 bg-card border border-primary/20 rounded-xl shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-foreground">Choose an action to add:</p>
        <button onClick={() => setAddingAfterId(null)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {FUNNEL_ACTIONS.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.type} onClick={() => addStep(a.type)}
              className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-left transition-colors hover:border-primary/30 hover:bg-primary/5 ${a.bg} ${a.border}`}>
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${a.color}`} />
              <div><p className={`text-xs font-semibold ${a.color}`}>{a.label}</p><p className="text-[10px] text-muted-foreground leading-tight">{a.desc}</p></div>
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  /* ════════════ BUILDER VIEW ════════════ */
  if (view === "builder" && activeFunnelId !== null) {
    const triggerDef = FUNNEL_TRIGGERS.find(t => t.type === triggerType) ?? FUNNEL_TRIGGERS[0];
    const TriggerIcon = triggerDef.icon;

    return (
      <div className="space-y-4">
        {/* ── Header ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setView("list"); setActiveFunnelId(null); }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
            <ChevronLeft className="w-4 h-4" />Funnels
          </button>
          <span className="text-muted-foreground text-sm">/</span>
          <input value={funnelName} onChange={e => setFunnelName(e.target.value)}
            onBlur={() => saveMeta({ name: funnelName })}
            className="font-bold text-foreground bg-transparent border-none outline-none text-base focus:underline decoration-dashed underline-offset-2 min-w-0 flex-1" />
          <div className="flex items-center gap-2 ml-auto">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            {/* Published / Draft toggle — controls both status and isActive */}
            <button
              onClick={() => toggleFunnelActive(activeFunnelId, funnelIsActive)}
              title={funnelIsActive ? "Set to Draft (deactivate)" : "Publish (activate)"}
              className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                funnelIsActive
                  ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500/20"
                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
              }`}>
              <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0 ${funnelIsActive ? "bg-green-500" : "bg-muted-foreground/40"}`}>
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${funnelIsActive ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </span>
              {funnelIsActive ? "Published" : "Draft"}
            </button>
            <button onClick={() => deleteFunnel(activeFunnelId)}
              className="p-1.5 text-muted-foreground hover:text-red-400 cursor-pointer rounded-md hover:bg-red-500/10 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl">
          <p className="text-xs text-blue-400 flex items-center gap-1.5">
            <Info className="w-3 h-3 flex-shrink-0" />
            {funnelStatus !== "published"
              ? "This funnel is in draft mode — it won't run until published."
              : funnelIsActive
                ? "This funnel is active and live — it will run automatically for matching contacts."
                : "This funnel is published but paused — toggle it Active to start running."
            }
          </p>
        </div>

        {/* ── Flow canvas ── */}
        <div className="flex flex-col items-center gap-0 max-w-md mx-auto pb-8">

          {/* Trigger card */}
          <div className={`w-full rounded-xl border-2 p-4 ${triggerDef.bg} ${triggerDef.border}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className={`text-[10px] border ${triggerDef.border} ${triggerDef.color}`}>TRIGGER</Badge>
                  <TriggerIcon className={`w-3.5 h-3.5 ${triggerDef.color}`} />
                  <span className="text-sm font-semibold text-foreground">{triggerDef.label}</span>
                </div>
                {!editingTrigger && (
                  <p className="text-xs text-muted-foreground">
                    {triggerType === "tag_applied" && triggerConfig.tagName ? `When tag "${triggerConfig.tagName}" is applied`
                      : triggerType === "list_added" && triggerConfig.listName ? `When added to "${triggerConfig.listName}"`
                      : triggerDef.desc}
                  </p>
                )}
              </div>
              <button onClick={() => setEditingTrigger(v => !v)} className={`p-1 cursor-pointer rounded transition-colors ${editingTrigger ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {editingTrigger && (
              <div className="mt-3 space-y-3 border-t border-border pt-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Trigger Type</Label>
                  <select value={triggerType} onChange={e => { setTriggerType(e.target.value); setTriggerConfig({}); }}
                    className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                    <optgroup label="User Lifecycle">
                      <option value="user_signup">User Signs Up</option>
                      <option value="user_login">User Logs In</option>
                      <option value="forgot_password">Forgot Password</option>
                      <option value="staff_added">Staff Member Added</option>
                    </optgroup>
                    <optgroup label="Creators">
                      <option value="creator_joined">User Becomes Creator</option>
                      <option value="creator_commission_earned">Creator Sale / Commission</option>
                      <option value="creator_payout_paid">Creator Payout Sent</option>
                      <option value="creator_kyc_submitted">Creator KYC Submitted</option>
                      <option value="creator_kyc_approved">Creator KYC Approved</option>
                      <option value="creator_kyc_rejected">Creator KYC Rejected</option>
                    </optgroup>
                    <optgroup label="Purchases &amp; Payments">
                      <option value="new_purchase">Purchase Completed</option>
                      <option value="payment_failed">Payment Failed</option>
                      <option value="coupon_used">Coupon Redeemed</option>
                    </optgroup>
                    <optgroup label="Course &amp; Lessons">
                      <option value="course_enrolled">Course Enrolled</option>
                      <option value="course_completed">Course Completed</option>
                      <option value="lesson_completed">Lesson Completed</option>
                    </optgroup>
                    <optgroup label="CRM Events">
                      <option value="tag_applied">Tag Applied</option>
                      <option value="list_added">Added to List</option>
                    </optgroup>
                    <optgroup label="Affiliate">
                      <option value="affiliate_joined">Affiliate Joined</option>
                      <option value="affiliate_commission">Commission Earned</option>
                      <option value="affiliate_application_submitted">Application Submitted</option>
                      <option value="affiliate_application_approved">Application Approved</option>
                      <option value="affiliate_application_rejected">Application Rejected</option>
                      <option value="affiliate_kyc_submitted">Affiliate KYC Submitted</option>
                      <option value="affiliate_kyc_approved">Affiliate KYC Approved</option>
                      <option value="affiliate_kyc_rejected">Affiliate KYC Rejected</option>
                      <option value="affiliate_payout_paid">Affiliate Payout Sent</option>
                    </optgroup>
                    <optgroup label="Other">
                      <option value="link_clicked">Email Link Clicked</option>
                    </optgroup>
                  </select>
                </div>
                {triggerType === "tag_applied" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Tag</Label>
                    <select value={triggerConfig.tagId ?? ""} onChange={e => { const t = tags.find(x => x.id === parseInt(e.target.value)); setTriggerConfig(t ? { tagId: t.id, tagName: t.name } : {}); }}
                      className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                      <option value="">— Select tag —</option>
                      {tags.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
                {triggerType === "list_added" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">List</Label>
                    <select value={triggerConfig.listId ?? ""} onChange={e => { const l = lists.find(x => x.id === parseInt(e.target.value)); setTriggerConfig(l ? { listId: l.id, listName: l.name } : {}); }}
                      className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                      <option value="">— Select list —</option>
                      {lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                )}
                <Button size="sm" onClick={() => { saveMeta({ triggerType, triggerConfig }); setEditingTrigger(false); }}>
                  Save Trigger
                </Button>
              </div>
            )}
          </div>

          {/* Add after trigger */}
          <div className="flex flex-col items-center">
            <div className="w-px h-4 bg-border" />
            <button onClick={() => setAddingAfterId(addingAfterId === "trigger" ? null : "trigger")}
              className={`w-6 h-6 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${addingAfterId === "trigger" ? "bg-primary/20 border-primary/50 text-primary" : "bg-card border-border text-muted-foreground hover:bg-primary/10 hover:border-primary/40 hover:text-primary"}`}>
              <Plus className="w-3 h-3" />
            </button>
            <div className="w-px h-4 bg-border" />
          </div>
          {ActionPicker({ afterId: "trigger" })}

          {/* Steps */}
          {steps.map((step, idx) => {
            const actionDef = FUNNEL_ACTIONS.find(a => a.type === step.actionType) ?? FUNNEL_ACTIONS[0];
            const ActionIcon = actionDef.icon;
            const isEditing = editingStepId === step.id;
            const c: Record<string, any> = isEditing ? stepDraft : (step.config ?? {});
            const afterId = `step-${step.id}`;

            return (
              <div key={step.id} className="flex flex-col items-center w-full">
                {/* Step card */}
                <div className={`w-full rounded-xl border p-4 transition-colors ${isEditing ? "border-primary/40 bg-primary/5" : "bg-card border-border hover:border-border/80"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] border ${actionDef.border} ${actionDef.color}`}>Step {idx + 1}</Badge>
                        <ActionIcon className={`w-3.5 h-3.5 ${actionDef.color}`} />
                        <span className="text-sm font-semibold text-foreground">{step.label?.trim() || actionDef.label}</span>
                        {step.label?.trim() && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${actionDef.border} ${actionDef.color} opacity-70`}>{actionDef.label}</span>
                        )}
                      </div>
                      {!isEditing && <p className="text-xs text-muted-foreground">{stepSummaryLabel(step)}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!isEditing && step.actionType !== "end" && (
                        <button onClick={() => { const cfg = { ...(step.config ?? {}) }; if (step.actionType === "send_email" && !cfg.mode) cfg.mode = "template"; setEditingStepId(step.id); setStepDraft({ ...cfg, __label: step.label ?? "" }); }}
                          className="p-1 text-muted-foreground hover:text-foreground cursor-pointer rounded transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => deleteStep(step.id)}
                        className="p-1 text-muted-foreground hover:text-red-400 cursor-pointer rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Step edit form */}
                  {isEditing && (
                    <div className="mt-3 space-y-3 border-t border-border pt-3">
                      <div className="space-y-1">
                        <Label htmlFor={`step-internal-label-${step.id}`} className="text-xs text-muted-foreground">
                          Internal Label <span className="opacity-60">(optional — for your reference)</span>
                        </Label>
                        <Input
                          id={`step-internal-label-${step.id}`}
                          value={c.__label ?? ""}
                          onChange={e => setStepDraft(p => ({ ...p, __label: e.target.value }))}
                          placeholder={`e.g. ${actionDef.label} — Welcome`}
                          maxLength={120}
                          className="bg-background border-border h-9"
                        />
                      </div>
                      {step.actionType === "wait" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Days</Label>
                            <Input type="number" min={0} value={c.days ?? 0} onChange={e => setStepDraft(p => ({ ...p, days: parseInt(e.target.value) || 0 }))} className="bg-background border-border h-9" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Hours</Label>
                            <Input type="number" min={0} max={23} value={c.hours ?? 0} onChange={e => setStepDraft(p => ({ ...p, hours: parseInt(e.target.value) || 0 }))} className="bg-background border-border h-9" />
                          </div>
                        </div>
                      )}
                      {(step.actionType === "apply_list" || step.actionType === "remove_list") && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">List</Label>
                          <select value={c.listId ?? ""} onChange={e => { const l = lists.find(x => x.id === parseInt(e.target.value)); setStepDraft(p => ({ ...p, listId: l?.id, listName: l?.name })); }}
                            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                            <option value="">— Select list —</option>
                            {lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </div>
                      )}
                      {(step.actionType === "apply_tag" || step.actionType === "remove_tag") && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Tag</Label>
                          <select value={c.tagId ?? ""} onChange={e => { const t = tags.find(x => x.id === parseInt(e.target.value)); setStepDraft(p => ({ ...p, tagId: t?.id, tagName: t?.name })); }}
                            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                            <option value="">— Select tag —</option>
                            {tags.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                      )}
                      {step.actionType === "send_email" && (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Mode</Label>
                            <select value={c.mode ?? "template"} onChange={e => setStepDraft(p => ({ ...p, mode: e.target.value }))}
                              className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                              <option value="template">Use Template</option>
                              <option value="custom">Custom Email</option>
                            </select>
                          </div>
                          {(c.mode ?? "template") === "template" ? (
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Template</Label>
                              <select value={c.templateId ?? ""} onChange={e => { const t = templates.find(x => x.id === parseInt(e.target.value)); setStepDraft(p => ({ ...p, templateId: t?.id, templateName: t?.name })); }}
                                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                                <option value="">— Select template —</option>
                                {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                              </select>
                            </div>
                          ) : (
                            <>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Subject</Label>
                                <Input value={c.subject ?? ""} onChange={e => setStepDraft(p => ({ ...p, subject: e.target.value }))} className="bg-background border-border h-9" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Body (HTML or plain text)</Label>
                                <textarea value={c.body ?? ""} onChange={e => setStepDraft(p => ({ ...p, body: e.target.value }))} rows={5}
                                  className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground resize-y font-mono" />
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" onClick={() => updateStep(step.id, stepDraft)}>Save Step</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingStepId(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Connector + add button below each step */}
                <div className="flex flex-col items-center">
                  <div className="w-px h-4 bg-border" />
                  <button onClick={() => setAddingAfterId(addingAfterId === afterId ? null : afterId)}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center cursor-pointer transition-colors ${addingAfterId === afterId ? "bg-primary/20 border-primary/50 text-primary" : "bg-card border-border text-muted-foreground hover:bg-primary/10 hover:border-primary/40 hover:text-primary"}`}>
                    <Plus className="w-3 h-3" />
                  </button>
                  <div className="w-px h-4 bg-border" />
                </div>
                {ActionPicker({ afterId })}
              </div>
            );
          })}

          {/* End of funnel stub */}
          <div className="w-full rounded-xl border border-dashed border-border bg-muted/10 p-3 text-center">
            <Flag className="w-4 h-4 text-muted-foreground mx-auto mb-1 opacity-40" />
            <p className="text-xs text-muted-foreground">End of funnel</p>
          </div>
        </div>
      </div>
    );
  }

  /* ════════════ LIST VIEW ════════════ */
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">Automation Funnels</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Build visual automation sequences triggered by user actions.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" />New Automation
        </Button>
      </div>

      {/* Create Funnel Dialog */}
      <Dialog open={showCreate} onOpenChange={open => { if (!open) { setShowCreate(false); setNewName(""); setNewTrigger("user_signup"); setNewTriggerCategory("all"); } }}>
        <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden" aria-describedby={undefined}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-bold text-foreground">Create an Automation Funnel</h2>
          </div>
          {/* Internal Label */}
          <div className="px-6 py-4 border-b border-border">
            <Label className="text-sm font-medium mb-1.5 block">
              Internal Label <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder={(FUNNEL_TRIGGERS.find(t => t.type === newTrigger)?.label) ?? "Internal Label"}
              className="bg-background border-border" onKeyDown={e => e.key === "Enter" && createFunnel()} />
            <p className="text-[11px] text-muted-foreground mt-1.5">Leave blank to use the selected trigger name.</p>
          </div>
          {/* Body: sidebar + grid */}
          <div className="flex" style={{ minHeight: 360, maxHeight: "60vh" }}>
            {/* Left category sidebar */}
            <div className="w-48 shrink-0 border-r border-border overflow-y-auto py-2">
              {[
                { id: "all",            label: "All Triggers" },
                { id: "user_lifecycle", label: "User Lifecycle" },
                { id: "creators",       label: "Creators" },
                { id: "purchases",      label: "Purchases" },
                { id: "courses",        label: "Course Events" },
                { id: "crm",            label: "CRM" },
                { id: "affiliate",      label: "Affiliate" },
                { id: "engagement",     label: "Engagement" },
              ].map(cat => (
                <button key={cat.id} onClick={() => setNewTriggerCategory(cat.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${newTriggerCategory === cat.id ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
                  {cat.label}
                </button>
              ))}
            </div>
            {/* Right trigger grid */}
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-sm font-semibold text-foreground mb-4">Select the trigger for this automation</p>
              <div className="grid grid-cols-3 gap-3">
                {FUNNEL_TRIGGERS.filter(t => {
                  const catMap: Record<string, string> = {
                    user_signup: "user_lifecycle", user_login: "user_lifecycle", forgot_password: "user_lifecycle", staff_added: "user_lifecycle",
                    creator_joined: "creators", creator_commission_earned: "creators", creator_payout_paid: "creators", creator_kyc_submitted: "creators", creator_kyc_approved: "creators", creator_kyc_rejected: "creators",
                    new_purchase: "purchases", payment_failed: "purchases", coupon_used: "purchases",
                    course_enrolled: "courses", course_completed: "courses", lesson_completed: "courses",
                    tag_applied: "crm", list_added: "crm",
                    affiliate_joined: "affiliate", affiliate_commission: "affiliate",
                    affiliate_application_submitted: "affiliate", affiliate_application_approved: "affiliate", affiliate_application_rejected: "affiliate",
                    affiliate_kyc_submitted: "affiliate", affiliate_kyc_approved: "affiliate", affiliate_kyc_rejected: "affiliate", affiliate_payout_paid: "affiliate",
                    link_clicked: "engagement",
                  };
                  return newTriggerCategory === "all" || catMap[t.type] === newTriggerCategory;
                }).map(t => {
                  const Icon = t.icon;
                  const selected = newTrigger === t.type;
                  return (
                    <button key={t.type} onClick={() => setNewTrigger(t.type)}
                      className={`text-left p-4 rounded-lg border-2 transition-all cursor-pointer ${selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"}`}>
                      <Icon className={`w-5 h-5 mb-2 ${t.color}`} />
                      <p className="text-sm font-semibold text-foreground leading-tight mb-1">{t.label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => { setShowCreate(false); setNewName(""); setNewTrigger("user_signup"); setNewTriggerCategory("all"); }}>Cancel</Button>
            <Button size="sm" onClick={createFunnel} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Funnel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Empty state */}
      {funnels.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Zap className="w-10 h-10 text-muted-foreground mb-3 opacity-30" />
          <p className="text-sm font-medium text-foreground">No automation funnels yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create a funnel to automate user journeys after key events.</p>
          <Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1.5" />Create First Funnel
          </Button>
        </div>
      )}

      {/* Funnel cards */}
      {funnels.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {funnels.map(f => {
            const trig = FUNNEL_TRIGGERS.find(t => t.type === f.triggerType) ?? FUNNEL_TRIGGERS[0];
            const TrigIcon = trig.icon;
            const stepCount = (f.steps ?? []).length;
            return (
              <div key={f.id} className={`bg-card border rounded-xl p-4 transition-colors group ${f.isActive ? "border-primary/30 hover:border-primary/50" : "border-border hover:border-border/80 opacity-75"}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${trig.bg} ${trig.border} border`}>
                    <TrigIcon className={`w-4 h-4 ${trig.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground truncate">{f.name}</h3>
                      {f.status === "published"
                        ? <Badge variant="outline" className="text-[10px] border border-green-500/30 text-green-400">Published</Badge>
                        : <Badge variant="outline" className="text-[10px] border border-border text-muted-foreground">Draft</Badge>
                      }
                    </div>
                    <p className="text-xs text-muted-foreground">{trig.label} · {stepCount} step{stepCount !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Toggle switch */}
                    <button
                      onClick={e => { e.stopPropagation(); toggleFunnelActive(f.id, !!f.isActive); }}
                      title={f.isActive ? "Set to Draft (deactivate)" : "Publish (activate)"}
                      className={`relative inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors focus:outline-none ${f.isActive ? "bg-green-500" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${f.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openFunnel(f)}
                        className="p-1.5 text-muted-foreground hover:text-foreground cursor-pointer rounded-md hover:bg-muted/50 transition-colors" title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => deleteFunnel(f.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-400 cursor-pointer rounded-md hover:bg-red-500/10 transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                {/* Step preview */}
                {stepCount > 0 && (
                  <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-1">
                    {(f.steps ?? []).slice(0, 4).map((s: any, i: number) => {
                      const a = FUNNEL_ACTIONS.find(x => x.type === s.actionType);
                      return a ? (
                        <span key={i} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border ${a.bg} ${a.border} ${a.color}`}>
                          {i + 1}. {a.label}
                        </span>
                      ) : null;
                    })}
                    {stepCount > 4 && <span className="text-[10px] text-muted-foreground self-center">+{stepCount - 4} more</span>}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => openFunnel(f)}
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-border text-foreground hover:bg-muted/40 hover:border-primary/40 cursor-pointer transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />Open Builder
                  </button>
                  <button onClick={() => openReport(f)}
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/50 cursor-pointer transition-colors">
                    <BarChart2 className="w-3.5 h-3.5" />Reports
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════ CAMPAIGNS ══════════════════════════════════════════════ */
function CampaignsTab() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", subject: "", templateId: "", htmlBody: "", recipientFilter: "all", listId: "", tagId: "", scheduledAt: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, t, l, tg] = await Promise.all([
      apiFetch("/api/admin/crm/campaigns").then(r => r.json()),
      apiFetch("/api/admin/crm/templates").then(r => r.json()),
      apiFetch("/api/admin/crm/lists").then(r => r.json()).catch(() => []),
      apiFetch("/api/admin/crm/tags").then(r => r.json()).catch(() => []),
    ]);
    setCampaigns(c); setTemplates(t.filter((t: any) => t.isActive));
    setLists(Array.isArray(l) ? l : []); setTags(Array.isArray(tg) ? tg : []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadTemplate = (tid: string) => {
    const t = templates.find((t: any) => String(t.id) === tid);
    if (t) setForm(f => ({ ...f, templateId: tid, subject: t.subject, htmlBody: t.htmlBody }));
    else setForm(f => ({ ...f, templateId: tid }));
  };

  const create = async () => {
    if (!form.name || !form.subject || !form.htmlBody) { toast({ title: "Fill all required fields", variant: "destructive" }); return; }
    if (form.recipientFilter === "list" && !form.listId) { toast({ title: "Select a list", variant: "destructive" }); return; }
    if (form.recipientFilter === "tag" && !form.tagId) { toast({ title: "Select a tag", variant: "destructive" }); return; }
    setSaving(true);
    const payload: Record<string, any> = { ...form, templateId: form.templateId ? parseInt(form.templateId) : null };
    if (form.listId) payload.listId = parseInt(form.listId);
    if (form.tagId) payload.tagId = parseInt(form.tagId);
    if (!form.scheduledAt) delete payload.scheduledAt;
    const res = await apiFetch("/api/admin/crm/campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    if (res.ok) {
      toast({ title: form.scheduledAt ? "Campaign scheduled!" : "Campaign created!" });
      setCreating(false); setForm({ name: "", subject: "", templateId: "", htmlBody: "", recipientFilter: "all", listId: "", tagId: "", scheduledAt: "" }); load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast({ title: e.error ?? "Failed", variant: "destructive" });
    }
    setSaving(false);
  };

  const sendCampaign = async (id: number) => {
    setSending(id);
    const res = await apiFetch(`/api/admin/crm/campaigns/${id}/send`, { method: "POST" });
    if (res.ok) toast({ title: "Campaign is sending!", description: "Emails are being delivered in the background." });
    else {
      const e = await res.json().catch(() => ({}));
      toast({ title: e.error ?? "Failed to send", variant: "destructive" });
    }
    setSending(null); setTimeout(load, 2000);
  };

  const del = async (id: number) => {
    setDeleting(id);
    await apiFetch(`/api/admin/crm/campaigns/${id}`, { method: "DELETE" });
    toast({ title: "Campaign deleted" }); load(); setDeleting(null);
  };

  const statusColor: Record<string, string> = {
    draft: "text-muted-foreground border-border",
    scheduled: "text-blue-400 border-blue-400/30 bg-blue-400/10",
    sending: "text-amber-400 border-amber-400/30 bg-amber-400/10",
    sent: "text-green-400 border-green-400/30 bg-green-400/10",
    failed: "text-red-400 border-red-400/30 bg-red-400/10",
  };

  const recipientLabel: Record<string, string> = {
    all: "All Users", enrolled: "Enrolled Students", not_enrolled: "Not Enrolled",
    list: "Email List", tag: "Contact Tag",
  };

  if (creating) {
    return (
      <div className="max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setCreating(false)} className="text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
          <h2 className="text-xl font-bold text-foreground">New Campaign</h2>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Campaign Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monthly Newsletter — April" className="bg-background border-border" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Load from Template (optional)</Label>
            <select value={form.templateId} onChange={e => loadTemplate(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground">
              <option value="">— Write from scratch —</option>
              {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Subject Line *</Label>
            <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Big news from VK Academy 🚀" className="bg-background border-border" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Recipients</Label>
            <select value={form.recipientFilter} onChange={e => setForm(f => ({ ...f, recipientFilter: e.target.value, listId: "", tagId: "" }))}
              className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground">
              <option value="all">All users</option>
              <option value="enrolled">Enrolled students only</option>
              <option value="not_enrolled">Users who haven't purchased</option>
              <option value="list">Specific Email List</option>
              <option value="tag">Specific Contact Tag</option>
            </select>
          </div>
          {form.recipientFilter === "list" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Choose List *</Label>
              <select value={form.listId} onChange={e => setForm(f => ({ ...f, listId: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                <option value="">— Select a list —</option>
                {lists.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({l.memberCount ?? 0} members)</option>)}
              </select>
            </div>
          )}
          {form.recipientFilter === "tag" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Choose Tag *</Label>
              <select value={form.tagId} onChange={e => setForm(f => ({ ...f, tagId: e.target.value }))}
                className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground">
                <option value="">— Select a tag —</option>
                {tags.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.subscriberCount} contacts)</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs text-muted-foreground">HTML Body *</Label>
              {form.htmlBody && <button onClick={() => setPreviewing(form.htmlBody)} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"><Eye className="w-3 h-3" />Preview</button>}
            </div>
            <Textarea value={form.htmlBody} onChange={e => setForm(f => ({ ...f, htmlBody: e.target.value }))}
              className="bg-background border-border font-mono text-xs min-h-[240px] resize-y" placeholder="<div>Your email HTML here…</div>" />
          </div>
          <TemplateVariablesPanel type="campaign" />
          <div className="border-t border-border pt-4 space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3 h-3" />Schedule Send (optional — leave blank to send manually)</Label>
            <Input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
              className="bg-background border-border text-sm" />
            {form.scheduledAt && <p className="text-[11px] text-blue-400 flex items-center gap-1"><Clock className="w-3 h-3" />Will auto-send at the scheduled time</p>}
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={create} disabled={saving} className="flex-1 bg-primary gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (form.scheduledAt ? <Calendar className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
              {saving ? "Saving…" : form.scheduledAt ? "Schedule Campaign" : "Create Campaign"}
            </Button>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
        {previewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold">Preview</h3>
                <button onClick={() => setPreviewing(null)} className="cursor-pointer"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                <iframe srcDoc={previewing} className="w-full min-h-[480px] rounded-lg border border-border bg-white" title="preview" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-foreground">Campaigns</h2><p className="text-sm text-muted-foreground mt-0.5">Send email blasts to your contacts. Schedule or send immediately.</p></div>
        <Button onClick={() => setCreating(true)} size="sm" className="bg-primary gap-1.5"><Plus className="w-4 h-4" />New Campaign</Button>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        : campaigns.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl py-20 text-center">
            <Send className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">No campaigns yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create your first campaign to send a bulk email.</p>
            <Button onClick={() => setCreating(true)} size="sm" className="bg-primary gap-1.5"><Plus className="w-4 h-4" />Create Campaign</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(c => (
              <div key={c.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                      <Badge variant="outline" className={`text-[10px] capitalize flex-shrink-0 ${statusColor[c.status]}`}>{c.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                    <div className="flex items-center flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Filter className="w-2.5 h-2.5" />{recipientLabel[c.recipientFilter] ?? c.recipientFilter}</span>
                      <span>Recipients: <span className="text-foreground font-medium">{c.recipientCount}</span></span>
                      {c.sentCount > 0 && <span>Sent: <span className="text-green-400 font-medium">{c.sentCount}</span></span>}
                      {c.failedCount > 0 && <span>Failed: <span className="text-red-400 font-medium">{c.failedCount}</span></span>}
                      {c.scheduledAt && c.status === "scheduled" && <span className="flex items-center gap-1 text-blue-400"><Clock className="w-2.5 h-2.5" />Scheduled: {new Date(c.scheduledAt).toLocaleString("en-IN")}</span>}
                      {c.sentAt && <span>Sent: {new Date(c.sentAt).toLocaleDateString("en-IN")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.htmlBody && <button onClick={() => setPreviewing(c.htmlBody)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"><Eye className="w-4 h-4" /></button>}
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <Button size="sm" className="bg-primary gap-1 text-xs" disabled={sending === c.id} onClick={() => sendCampaign(c.id)}>
                        {sending === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                        Send Now
                      </Button>
                    )}
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <button onClick={() => del(c.id)} disabled={deleting === c.id} className="text-muted-foreground hover:text-red-400 transition-colors cursor-pointer">
                        {deleting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Campaign Preview</h3>
              <button onClick={() => setPreviewing(null)} className="cursor-pointer"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <iframe srcDoc={previewing} className="w-full min-h-[480px] rounded-lg border border-border bg-white" title="preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════ SUBSCRIBERS ══════════════════════════════════════════════ */
function ContactProfilePanel({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { toast } = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [addingTag, setAddingTag] = useState(false);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [panelTab, setPanelTab] = useState<"tags" | "emails" | "lists">("tags");

  const load = useCallback(async () => {
    setLoading(true);
    const [p, t] = await Promise.all([
      apiFetch(`/api/admin/crm/contacts/${userId}`).then(r => r.json()),
      apiFetch("/api/admin/crm/tags").then(r => r.json()).catch(() => []),
    ]);
    setProfile(p); setAllTags(Array.isArray(t) ? t : []);
    setLoading(false);
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const addTag = async () => {
    if (!selectedTagId) return;
    setAddingTag(true);
    await apiFetch(`/api/admin/crm/contacts/${userId}/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagId: parseInt(selectedTagId) }) });
    setSelectedTagId(""); load();
    setAddingTag(false);
  };

  const removeTag = async (tagId: number) => {
    await apiFetch(`/api/admin/crm/contacts/${userId}/tags/${tagId}`, { method: "DELETE" });
    load();
    toast({ title: "Tag removed" });
  };

  const assignedTagIds = new Set(profile?.tags?.map((t: any) => t.id) ?? []);
  const availableTags = allTags.filter((t: any) => !assignedTagIds.has(t.id));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-full max-w-md bg-card border-l border-border flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <h3 className="text-sm font-semibold">Contact Profile</h3>
          <button onClick={onClose} className="cursor-pointer text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : profile ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 border-b border-border">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center text-xl font-bold text-primary flex-shrink-0">
                  {profile.user?.name?.charAt(0)?.toUpperCase() ?? "?"}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{profile.user?.name}</p>
                  <p className="text-sm text-muted-foreground">{profile.user?.email}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="outline" className={`text-[10px] capitalize ${profile.user?.role === "admin" ? "text-red-400 border-red-400/30" : profile.user?.role === "affiliate" ? "text-purple-400 border-purple-400/30" : "text-muted-foreground border-border"}`}>{profile.user?.role}</Badge>
                    <span className="text-[11px] text-muted-foreground">Joined {new Date(profile.user?.createdAt).toLocaleDateString("en-IN")}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex border-b border-border">
              {(["tags", "emails", "lists"] as const).map(t => (
                <button key={t} onClick={() => setPanelTab(t)} className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors cursor-pointer ${panelTab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>{t}</button>
              ))}
            </div>
            {panelTab === "tags" && (
              <div className="p-4 space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Current Tags</p>
                  {profile.tags?.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No tags assigned.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {profile.tags?.map((tag: any) => (
                        <span key={tag.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
                          {tag.name}
                          <button onClick={() => removeTag(tag.id)} className="cursor-pointer opacity-70 hover:opacity-100 ml-0.5"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {availableTags.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Add Tag</p>
                    <div className="flex gap-2">
                      <select value={selectedTagId} onChange={e => setSelectedTagId(e.target.value)}
                        className="flex-1 h-8 px-2 rounded-md border border-border bg-background text-xs text-foreground">
                        <option value="">Select tag…</option>
                        {availableTags.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <Button size="sm" className="h-8 px-3 text-xs" onClick={addTag} disabled={!selectedTagId || addingTag}>
                        {addingTag ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {panelTab === "emails" && (
              <div className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-3">Recent Email Activity ({profile.emailHistory?.length ?? 0})</p>
                {profile.emailHistory?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No emails sent yet.</p>
                ) : (
                  <div className="space-y-2">
                    {profile.emailHistory?.map((send: any) => (
                      <div key={send.id} className="bg-background border border-border rounded-lg p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-foreground line-clamp-1">{send.subject}</p>
                          <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${send.status === "sent" ? "text-green-400 border-green-400/30" : "text-red-400 border-red-400/30"}`}>{send.status}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                          <span className="capitalize">{send.type}</span> · {new Date(send.sentAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {panelTab === "lists" && (
              <div className="p-4">
                <p className="text-xs font-medium text-muted-foreground mb-3">List Memberships</p>
                {profile.listMemberships?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not in any lists.</p>
                ) : (
                  <div className="space-y-2">
                    {profile.listMemberships?.map((l: any) => (
                      <div key={l.id} className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2">
                        <List className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs font-medium text-foreground">{l.name}</p>
                        <Badge variant="outline" className="ml-auto text-[10px] capitalize">{l.type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Contact not found</div>}
      </div>
    </div>
  );
}

function SubscribersTab() {
  const [subs, setSubs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [tagFilter, setTagFilter] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [tags, setTags] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const limit = 30;

  const load = useCallback(async (q = "", p = 0, tf = "", lf = "") => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(p * limit) });
    if (q) params.set("search", q);
    if (tf) params.set("tagId", tf);
    if (lf) params.set("listId", lf);
    const [res, tagRes, listRes] = await Promise.all([
      apiFetch(`/api/admin/crm/subscribers?${params}`),
      apiFetch("/api/admin/crm/tags"),
      apiFetch("/api/admin/crm/lists"),
    ]);
    if (res.ok) { const data = await res.json(); setSubs(data.users); setTotal(data.total); }
    if (tagRes.ok) { const td = await tagRes.json(); setTags(Array.isArray(td) ? td : []); }
    if (listRes.ok) { const ld = await listRes.json(); setLists(Array.isArray(ld) ? ld : []); }
    setLoading(false);
  }, []);

  useEffect(() => { load(search, page, tagFilter, listFilter); }, [load, search, page, tagFilter, listFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div><h2 className="text-xl font-bold text-foreground">Contacts</h2><p className="text-sm text-muted-foreground mt-0.5">All registered users — <span className="text-foreground font-medium">{total}</span> total</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          {lists.length > 0 && (
            <select value={listFilter} onChange={e => { setListFilter(e.target.value); setTagFilter(""); setPage(0); }}
              className="h-9 px-2 rounded-md border border-border bg-card text-xs text-foreground">
              <option value="">All Lists</option>
              {lists.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {tags.length > 0 && (
            <select value={tagFilter} onChange={e => { setTagFilter(e.target.value); setListFilter(""); setPage(0); }}
              className="h-9 px-2 rounded-md border border-border bg-card text-xs text-foreground">
              <option value="">All Tags</option>
              {tags.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search by name or email…" className="bg-card border-border w-56" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_72px_88px_16px] gap-x-4 px-4 py-2.5 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide items-center">
          <span>Name</span><span>Email</span><span>Lists</span><span>Tags</span><span>Role</span><span>Joined</span><span></span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : subs.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No subscribers found</div>
        ) : (
          <div className="divide-y divide-border">
            {subs.map(s => (
              <div key={s.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_72px_88px_16px] gap-x-4 items-center px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer" onClick={() => setProfileUserId(s.id)}>
                <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                <div className="flex flex-wrap gap-1 min-w-0">
                  {(s.lists ?? []).slice(0, 2).map((l: string) => (
                    <span key={l} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 truncate max-w-[80px]">{l}</span>
                  ))}
                  {(s.lists ?? []).length > 2 && <span className="text-[10px] text-muted-foreground">+{s.lists.length - 2}</span>}
                  {(s.lists ?? []).length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
                </div>
                <div className="flex flex-wrap gap-1 min-w-0">
                  {(s.tags ?? []).slice(0, 2).map((t: { name: string; color: string }) => (
                    <span key={t.name} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-border truncate max-w-[80px]">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />{t.name}
                    </span>
                  ))}
                  {(s.tags ?? []).length > 2 && <span className="text-[10px] text-muted-foreground">+{s.tags.length - 2}</span>}
                  {(s.tags ?? []).length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
                </div>
                <Badge variant="outline" className={`text-[10px] capitalize ${s.role === "admin" ? "text-red-400 border-red-400/30" : s.role === "affiliate" ? "text-purple-400 border-purple-400/30" : "text-muted-foreground border-border"}`}>{s.role}</Badge>
                <span className="text-[11px] text-muted-foreground">{new Date(s.createdAt).toLocaleDateString("en-IN")}</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            ))}
          </div>
        )}
      </div>

      {total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      {profileUserId !== null && <ContactProfilePanel userId={profileUserId} onClose={() => setProfileUserId(null)} />}
    </div>
  );
}

/* ══════════════════════════════════════════════ EMAIL LOGS ══════════════════════════════════════════════ */

const RETENTION_OPTIONS = [
  { value: "none",  label: "Disabled (keep forever)" },
  { value: "7",     label: "7 Days" },
  { value: "14",    label: "14 Days" },
  { value: "30",    label: "30 Days" },
  { value: "60",    label: "60 Days" },
  { value: "90",    label: "90 Days" },
  { value: "180",   label: "6 Months" },
  { value: "365",   label: "1 Year" },
  { value: "730",   label: "2 Years" },
];

const SEND_TYPE_META: Record<string, { label: string; color: string }> = {
  campaign:   { label: "Campaign",   color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  automation: { label: "Automation", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  sequence:   { label: "Sequence",   color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  test:       { label: "Test",       color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
};

function EmailLogsTab() {
  const { toast } = useToast();
  const [data, setData] = useState<{ sends: any[]; total: number; totalPages: number }>({ sends: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed">("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [resending, setResending] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [detailLog, setDetailLog] = useState<any | null>(null);
  const [detailData, setDetailData] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bodyExpanded, setBodyExpanded] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkResending, setBulkResending] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [retentionDays, setRetentionDays] = useState<string>("none");
  const [savingRetention, setSavingRetention] = useState(false);
  const [retentionEditing, setRetentionEditing] = useState(false);
  const pageSize = 25;

  const load = async (opts?: { status?: string; q?: string; start?: string; end?: string; pg?: number }) => {
    setLoading(true);
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    const s = opts?.status ?? statusFilter;
    const q = opts?.q ?? search;
    const sd = opts?.start ?? startDate;
    const ed = opts?.end ?? endDate;
    const p = String(opts?.pg ?? page);
    if (s && s !== "all") params.set("status", s);
    if (q.trim()) params.set("search", q.trim());
    if (sd) params.set("startDate", sd);
    if (ed) params.set("endDate", ed);
    params.set("page", p);
    const r = await apiFetch(`/api/admin/crm/sends?${params}`);
    if (r.ok) setData(await r.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter, search, startDate, endDate, page]);

  useEffect(() => {
    apiFetch("/api/admin/crm/email-log-retention").then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        const val = d.retentionDays ? String(d.retentionDays) : "none";
        setRetentionDays(val);
        setRetentionEditing(val === "none");
      }
    });
  }, []);

  const saveRetention = async () => {
    setSavingRetention(true);
    const r = await apiFetch("/api/admin/crm/email-log-retention", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionDays: retentionDays === "none" ? null : Number(retentionDays) }),
    });
    if (r.ok) {
      toast({ title: "Saved", description: retentionDays === "none" ? "Auto-delete disabled." : `Logs older than ${RETENTION_OPTIONS.find(o => o.value === retentionDays)?.label} will be deleted automatically.` });
      setRetentionEditing(false);
    } else {
      toast({ title: "Error saving retention setting", variant: "destructive" });
    }
    setSavingRetention(false);
  };

  const handleSearch = () => { setSearch(searchInput); setPage(1); };
  const handleStatusChange = (s: "all" | "sent" | "failed") => { setStatusFilter(s); setPage(1); };
  const applyDateFilter = () => { setPage(1); load({ start: startDate, end: endDate, pg: 1 }); };
  const clearFilters = () => { setStatusFilter("all"); setSearch(""); setSearchInput(""); setStartDate(""); setEndDate(""); setPage(1); };

  const resend = async (id: number) => {
    setResending(id);
    const r = await apiFetch(`/api/admin/crm/sends/${id}/resend`, { method: "POST" });
    if (r.ok) { toast({ title: "Email resent successfully" }); load(); }
    else { const d = await r.json(); toast({ title: "Resend failed", description: d.error, variant: "destructive" }); }
    setResending(null);
  };

  const deleteLog = async (id: number) => {
    if (!confirm("Delete this log entry?")) return;
    setDeleting(id);
    const r = await apiFetch(`/api/admin/crm/sends/${id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: "Log deleted" }); load(); }
    setDeleting(null);
  };

  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} selected log${selectedIds.size > 1 ? "s" : ""}?`)) return;
    setBulkDeleting(true);
    await Promise.all([...selectedIds].map(id => apiFetch(`/api/admin/crm/sends/${id}`, { method: "DELETE" })));
    setSelectedIds(new Set());
    toast({ title: `${selectedIds.size} log${selectedIds.size > 1 ? "s" : ""} deleted` });
    load();
    setBulkDeleting(false);
  };

  const bulkResend = async () => {
    if (!selectedIds.size) return;
    setBulkResending(true);
    const results = await Promise.allSettled([...selectedIds].map(id => apiFetch(`/api/admin/crm/sends/${id}/resend`, { method: "POST" })));
    const ok = results.filter(r => r.status === "fulfilled" && (r.value as Response).ok).length;
    const fail = results.length - ok;
    setSelectedIds(new Set());
    toast({ title: `${ok} email${ok !== 1 ? "s" : ""} resent${fail > 0 ? `, ${fail} failed` : ""}`, variant: fail > 0 ? "destructive" : "default" });
    load();
    setBulkResending(false);
  };

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const currentPageIds = data.sends.map((s: any) => s.id);
  const allPageSelected = currentPageIds.length > 0 && currentPageIds.every(id => selectedIds.has(id));
  const somePageSelected = currentPageIds.some(id => selectedIds.has(id)) && !allPageSelected;

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds(prev => { const n = new Set(prev); currentPageIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); currentPageIds.forEach(id => n.add(id)); return n; });
    }
  };

  const openDetail = async (log: any) => {
    setDetailLog(log);
    setDetailData(null);
    setDetailLoading(true);
    setBodyExpanded(true);
    const r = await apiFetch(`/api/admin/crm/sends/${log.id}`);
    if (r.ok) setDetailData(await r.json());
    setDetailLoading(false);
  };

  const formatDateTime = (dt: string) => {
    const d = new Date(dt);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " · " +
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  };

  const sentCount = data.sends.filter(s => s.status === "sent").length;
  const failedCount = data.sends.filter(s => s.status === "failed").length;
  const hasFilters = statusFilter !== "all" || search || startDate || endDate;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />Email Logs
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Full history of every email sent through this platform — campaigns, automations, sequences and tests.
          </p>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs cursor-pointer text-muted-foreground" onClick={clearFilters}>
            <X className="w-3.5 h-3.5" />Clear filters
          </Button>
        )}
      </div>

      {/* ── Auto-Delete Logs Setting ── */}
      <div className="bg-card border border-border rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${retentionEditing ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
            <Trash2 className={`w-4 h-4 ${retentionEditing ? "text-red-400" : "text-emerald-400"}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Auto-Delete Email Logs</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {retentionEditing
                ? (retentionDays === "none" ? "Logs are kept forever. Select a period to enable auto-delete." : `Will delete logs older than ${RETENTION_OPTIONS.find(o => o.value === retentionDays)?.label}. Click Save to confirm.`)
                : (retentionDays === "none" ? "Auto-delete is disabled — logs are kept forever." : `Active: logs older than ${RETENTION_OPTIONS.find(o => o.value === retentionDays)?.label} are deleted automatically.`)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {retentionEditing ? (
            <>
              <select
                value={retentionDays}
                onChange={e => setRetentionDays(e.target.value)}
                className="h-8 rounded-lg border border-border bg-background text-sm text-foreground px-3 pr-8 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {RETENTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <Button size="sm" className="h-8 text-xs cursor-pointer gap-1.5" onClick={saveRetention} disabled={savingRetention}>
                {savingRetention ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Save
              </Button>
              <button onClick={() => setRetentionEditing(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              {retentionDays !== "none" && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {RETENTION_OPTIONS.find(o => o.value === retentionDays)?.label}
                </span>
              )}
              <button
                onClick={() => setRetentionEditing(true)}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Pencil className="w-3 h-3" />Edit
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status pills */}
          <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-1">
            {(["all", "sent", "failed"] as const).map(s => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer capitalize ${
                  statusFilter === s
                    ? s === "failed"
                      ? "bg-red-500/15 text-red-400 border border-red-500/20"
                      : s === "sent"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                      : "bg-primary/15 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="h-8 text-xs w-36 bg-background"
              placeholder="Start date"
            />
            <span className="text-xs text-muted-foreground flex-shrink-0">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="h-8 text-xs w-36 bg-background"
              placeholder="End date"
            />
            <Button size="sm" variant="outline" className="h-8 px-3 text-xs cursor-pointer" onClick={applyDateFilter}>
              <Filter className="w-3 h-3 mr-1" />Filter
            </Button>
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Subject or recipient…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSearch()}
                className="pl-8 h-8 text-xs w-52 bg-background"
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 w-8 p-0 cursor-pointer" onClick={handleSearch}>
              <Search className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* ── Bulk action bar ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
          <span className="text-xs font-medium text-primary">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              onClick={bulkResend}
              disabled={bulkResending || bulkDeleting}
              className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors cursor-pointer disabled:opacity-40"
            >
              {bulkResending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Resend Selected
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkDeleting || bulkResending}
              className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors cursor-pointer disabled:opacity-40"
            >
              {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[32px_3fr_2fr_75px_140px_185px] items-center gap-x-4 px-5 py-3 border-b border-border bg-muted/20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          <input
            type="checkbox"
            ref={(el) => { if (el) el.indeterminate = somePageSelected; }}
            checked={allPageSelected}
            onChange={toggleSelectAll}
            className="w-3.5 h-3.5 rounded accent-primary cursor-pointer [color-scheme:dark]"
          />
          <span>Subject</span>
          <span>To</span>
          <span>Status</span>
          <span>Date &amp; Time</span>
          <span>Actions</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="divide-y divide-border">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="grid grid-cols-[32px_3fr_2fr_75px_140px_185px] items-center gap-x-4 px-5 py-4 animate-pulse">
                <div className="w-3.5 h-3.5 rounded bg-muted/40" />
                <div className="space-y-1.5">
                  <div className="h-3 bg-muted/40 rounded w-64" />
                  <div className="h-2.5 bg-muted/30 rounded w-24" />
                </div>
                <div className="h-3 bg-muted/30 rounded w-36" />
                <div className="h-5 bg-muted/30 rounded-full w-14" />
                <div className="h-3 bg-muted/30 rounded w-32" />
                <div className="flex gap-1.5">
                  <div className="w-16 h-7 rounded-lg bg-muted/30" />
                  <div className="w-7 h-7 rounded-lg bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        ) : data.sends.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center">
              <Clock className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No email logs found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {hasFilters ? "Try adjusting your filters or search term." : "Emails sent through the platform will appear here."}
              </p>
            </div>
            {hasFilters && (
              <Button size="sm" variant="outline" className="cursor-pointer gap-1.5" onClick={clearFilters}>
                <X className="w-3.5 h-3.5" />Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.sends.map((log: any) => {
              const isFailed = log.status === "failed";
              const typeMeta = SEND_TYPE_META[log.type] ?? SEND_TYPE_META.test;
              return (
                <div
                  key={log.id}
                  className={`grid grid-cols-[32px_3fr_2fr_75px_140px_185px] items-center gap-x-4 px-5 py-3.5 transition-colors group ${
                    isFailed ? "bg-red-500/[0.04] hover:bg-red-500/[0.07]" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(log.id)}
                    onChange={() => toggleSelect(log.id)}
                    className="w-3.5 h-3.5 rounded accent-primary cursor-pointer [color-scheme:dark]"
                  />

                  {/* Subject + type */}
                  <div className="min-w-0">
                    <button
                      onClick={() => openDetail(log)}
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer text-left leading-tight block truncate max-w-full"
                    >
                      {log.subject || "(no subject)"}
                    </button>
                    <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${typeMeta.color}`}>
                      {typeMeta.label}
                    </span>
                  </div>

                  {/* Recipient */}
                  <p className="text-xs text-muted-foreground truncate">{log.email}</p>

                  {/* Status badge */}
                  {isFailed ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 w-fit">
                      <XCircle className="w-3 h-3" />Failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit">
                      <CheckCircle2 className="w-3 h-3" />Sent
                    </span>
                  )}

                  {/* Date-time */}
                  <span className="text-xs text-muted-foreground">{formatDateTime(log.sentAt)}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => resend(log.id)}
                      disabled={resending === log.id}
                      title="Resend this email"
                      className="flex items-center gap-1 px-2.5 h-7 rounded-lg text-[11px] font-medium bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {resending === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                      {isFailed ? "Retry" : "Resend"}
                    </button>
                    <button
                      onClick={() => openDetail(log)}
                      title="View details"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteLog(log.id)}
                      disabled={deleting === log.id}
                      title="Delete log"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {deleting === log.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer pagination */}
        {!loading && data.total > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Showing {Math.min((page - 1) * pageSize + 1, data.total)}–{Math.min(page * pageSize, data.total)} of <span className="font-medium text-foreground">{data.total.toLocaleString()}</span> logs
              </span>
              {!loading && data.sends.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />{sentCount} sent
                  </span>
                  {failedCount > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-red-400">
                      <XCircle className="w-3 h-3" />{failedCount} failed
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-white/5 disabled:opacity-30 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs text-muted-foreground px-2">
                Page <span className="font-semibold text-foreground">{page}</span> of {data.totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-white/5 disabled:opacity-30 cursor-pointer transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailLog} onOpenChange={v => { if (!v) { setDetailLog(null); setDetailData(null); } }}>
        <DialogContent className="max-w-4xl w-full flex flex-col p-0 gap-0 overflow-hidden max-h-[92vh] [&>button:last-of-type]:hidden" aria-describedby={undefined}>

          {/* Dialog header */}
          <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-border bg-card">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                  detailLog?.status === "failed"
                    ? "bg-red-500/10 border-red-500/20"
                    : "bg-emerald-500/10 border-emerald-500/20"
                }`}>
                  {detailLog?.status === "failed"
                    ? <XCircle className="w-4 h-4 text-red-400" />
                    : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-sm font-semibold leading-snug truncate">Email Log</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{detailLog?.subject || "(no subject)"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8 text-xs cursor-pointer"
                  disabled={resending === detailLog?.id}
                  onClick={() => resend(detailLog?.id)}
                >
                  {resending === detailLog?.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RotateCcw className="w-3.5 h-3.5" />}
                  {detailLog?.status === "failed" ? "Retry" : "Resend"}
                </Button>
                <button
                  onClick={() => { setDetailLog(null); setDetailData(null); }}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Loading email details…</p>
              </div>
            ) : detailLog ? (
              <div className="divide-y divide-border">

                {/* ── Status + Date row ── */}
                <div className="px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</span>
                    {detailLog.status === "failed" ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
                        <XCircle className="w-3.5 h-3.5" />Failed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" />Sent
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="font-medium text-foreground">{formatDateTime(detailLog.sentAt)}</span>
                  </div>
                </div>

                {/* ── From / To ── */}
                <div className="px-6 py-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">From</p>
                    <p className="text-sm text-foreground font-medium break-all">
                      {detailData?.fromAddress ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">To</p>
                    <p className="text-sm text-foreground font-medium break-all">{detailLog.email}</p>
                  </div>
                </div>

                {/* ── Subject / Type / Event ── */}
                <div className="px-6 py-4 grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Subject</p>
                    <p className="text-sm text-foreground font-medium">{detailLog.subject || "(no subject)"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Type</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${SEND_TYPE_META[detailLog.type]?.color ?? ""}`}>
                      {SEND_TYPE_META[detailLog.type]?.label ?? detailLog.type}
                    </span>
                  </div>
                </div>

                {/* Automation event / campaign name if applicable */}
                {(detailLog.automationEvent || detailData?.campaignName) && (
                  <div className="px-6 py-4">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                      {detailLog.automationEvent ? "Automation Event" : "Campaign"}
                    </p>
                    <p className="text-sm text-foreground font-medium capitalize">
                      {detailLog.automationEvent
                        ? detailLog.automationEvent.replace(/_/g, " ")
                        : detailData?.campaignName}
                    </p>
                  </div>
                )}

                {/* ── Email Body Preview ── */}
                <div>
                  <button
                    onClick={() => setBodyExpanded(e => !e)}
                    className="w-full px-6 py-3.5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Email Body</span>
                      {!detailData && !detailLoading && (
                        <span className="text-[11px] text-muted-foreground">(loading…)</span>
                      )}
                      {detailData && !detailData.html && (
                        <span className="text-[11px] text-muted-foreground">(not available)</span>
                      )}
                    </div>
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${bodyExpanded ? "rotate-90" : ""}`} />
                  </button>

                  {bodyExpanded && (
                    <div className="border-t border-border">
                      {!detailData ? (
                        <div className="px-6 py-8 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : detailData.html ? (
                        <div className="relative">
                          <iframe
                            srcDoc={detailData.html}
                            title="Email Preview"
                            className="w-full border-0 bg-white"
                            style={{ height: "480px" }}
                            sandbox="allow-same-origin"
                          />
                          <button
                            onClick={() => {
                              const win = window.open("", "_blank");
                              if (win) { win.document.write(detailData.html); win.document.close(); }
                            }}
                            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/90 backdrop-blur border border-border text-xs font-medium text-foreground hover:bg-background transition-colors cursor-pointer shadow-sm"
                          >
                            <Eye className="w-3.5 h-3.5" />Open full screen
                          </button>
                        </div>
                      ) : (
                        <div className="px-6 py-10 flex flex-col items-center gap-2 text-center">
                          <Mail className="w-8 h-8 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">Email body not stored for this log type.</p>
                          <p className="text-xs text-muted-foreground/70">Only Campaign and Automation emails have a retrievable body.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Server Response / Fail Reason ── */}
                <div className="px-6 py-4">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Server Response</p>
                  <div className={`rounded-xl p-4 font-mono text-xs leading-relaxed ${
                    detailLog.status === "failed"
                      ? "bg-red-500/5 border border-red-500/15 text-red-400"
                      : "bg-muted/30 border border-border text-emerald-400"
                  }`}>
                    {detailLog.status === "failed"
                      ? `{ "status": "failed",\n  "reason": "${detailLog.failReason ?? "Unknown error"}" }`
                      : `{ "status": "sent",\n  "response": "OK" }`}
                  </div>
                </div>

              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════ LISTS ══════════════════════════════════════════════ */
const LIST_TYPE_META: Record<string, { label: string; color: string; description: string }> = {
  all_subscribers: { label: "All Subscribers", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", description: "Every registered user" },
  enrolled:        { label: "Enrolled",         color: "bg-green-500/10 text-green-400 border-green-500/20", description: "Users with at least one enrollment" },
  optin:           { label: "Optin",            color: "bg-purple-500/10 text-purple-400 border-purple-500/20", description: "Opted-in via landing/optin pages" },
  manual:          { label: "Manual",           color: "bg-amber-500/10 text-amber-400 border-amber-500/20", description: "Manually managed" },
};

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return `${Math.floor(months / 12)} year${Math.floor(months / 12) > 1 ? "s" : ""} ago`;
}

function ListsTab() {
  const { toast } = useToast();
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [viewList, setViewList] = useState<any | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingUsers, setAddingUsers] = useState<number[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", description: "", type: "manual" });

  const [editList, setEditList] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: "", description: "", type: "manual" });

  const [listSearch, setListSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const load = async () => {
    setLoading(true);
    const r = await apiFetch("/api/admin/crm/lists");
    if (r.ok) setLists(await r.json());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openList = async (list: any) => {
    setViewList(list);
    setMembersLoading(true);
    setMemberSearch(""); setMemberSearchResults([]);
    const r = await apiFetch(`/api/admin/crm/lists/${list.id}/members`);
    if (r.ok) setMembers(await r.json());
    setMembersLoading(false);
  };

  const syncList = async (list: any) => {
    setSyncing(list.id);
    const r = await apiFetch(`/api/admin/crm/lists/${list.id}/sync`, { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      toast({ title: "Synced", description: `${d.total} members in list.` });
      load();
      if (viewList?.id === list.id) openList(list);
    } else toast({ title: "Sync failed", variant: "destructive" });
    setSyncing(null);
  };

  const deleteList = async (id: number) => {
    if (!confirm("Delete this list? Members will also be removed.")) return;
    setDeleting(id);
    const r = await apiFetch(`/api/admin/crm/lists/${id}`, { method: "DELETE" });
    if (r.ok) { toast({ title: "Deleted" }); load(); if (viewList?.id === id) setViewList(null); }
    else { const d = await r.json(); toast({ title: "Error", description: d.error, variant: "destructive" }); }
    setDeleting(null);
  };

  const createList = async () => {
    if (!createForm.name.trim()) return;
    setCreating(true);
    const r = await apiFetch("/api/admin/crm/lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createForm) });
    if (r.ok) { toast({ title: "List created" }); setCreateOpen(false); setCreateForm({ name: "", description: "", type: "manual" }); load(); }
    else toast({ title: "Error", variant: "destructive" });
    setCreating(false);
  };

  const saveEdit = async () => {
    if (!editList || !editForm.name.trim()) return;
    setSaving(true);
    const r = await apiFetch(`/api/admin/crm/lists/${editList.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm) });
    if (r.ok) { toast({ title: "List updated" }); setEditList(null); load(); }
    else toast({ title: "Error", variant: "destructive" });
    setSaving(false);
  };

  const searchUsers = async (q: string) => {
    setMemberSearch(q);
    if (!q.trim() || !viewList) { setMemberSearchResults([]); return; }
    setSearching(true);
    const r = await apiFetch(`/api/admin/crm/lists/${viewList.id}/search-users?q=${encodeURIComponent(q)}`);
    if (r.ok) setMemberSearchResults(await r.json());
    setSearching(false);
  };

  const addUser = async (userId: number) => {
    if (!viewList) return;
    setAddingUsers(a => [...a, userId]);
    const r = await apiFetch(`/api/admin/crm/lists/${viewList.id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: [userId] }) });
    if (r.ok) {
      toast({ title: "Added" });
      setMemberSearchResults(s => s.filter(u => u.id !== userId));
      const mr = await apiFetch(`/api/admin/crm/lists/${viewList.id}/members`);
      if (mr.ok) setMembers(await mr.json());
      load();
    }
    setAddingUsers(a => a.filter(i => i !== userId));
  };

  const removeMember = async (userId: number) => {
    if (!viewList) return;
    const r = await apiFetch(`/api/admin/crm/lists/${viewList.id}/members/${userId}`, { method: "DELETE" });
    if (r.ok) { setMembers(m => m.filter(u => u.id !== userId)); load(); }
  };

  /* ── Member detail view ── */
  if (viewList) {
    const meta = LIST_TYPE_META[viewList.type] ?? LIST_TYPE_META.manual;
    return (
      <div className="space-y-5">
        {/* Breadcrumb + header */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button onClick={() => setViewList(null)} className="hover:text-foreground transition-colors cursor-pointer flex items-center gap-1">
            <List className="w-3.5 h-3.5" />Lists
          </button>
          <ChevronRight className="w-3 h-3 opacity-40" />
          <span className="text-foreground font-medium">{viewList.name}</span>
        </div>

        {/* List info card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-5 flex items-start gap-5">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <List className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg font-bold text-foreground">{viewList.name}</h2>
                <Badge variant="outline" className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                  {meta.label}
                </Badge>
                {viewList.isSystem && (
                  <Badge variant="outline" className="text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground border-border">
                    System
                  </Badge>
                )}
              </div>
              {viewList.description && <p className="text-sm text-muted-foreground mt-1">{viewList.description}</p>}
              <p className="text-xs text-muted-foreground mt-1.5">{meta.description}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {(viewList.type === "enrolled" || viewList.type === "all_subscribers") && (
                <Button size="sm" variant="outline" className="gap-1.5 h-8 cursor-pointer text-xs" onClick={() => syncList(viewList)} disabled={syncing === viewList.id}>
                  <RotateCcw className={`w-3.5 h-3.5 ${syncing === viewList.id ? "animate-spin" : ""}`} />
                  {syncing === viewList.id ? "Syncing…" : "Sync Now"}
                </Button>
              )}
              <Button size="sm" variant="ghost" className="gap-1.5 h-8 cursor-pointer text-xs" onClick={() => setViewList(null)}>
                <ChevronLeft className="w-3.5 h-3.5" />Back
              </Button>
            </div>
          </div>

          {/* Stat strip */}
          <div className="border-t border-border grid grid-cols-3 divide-x divide-border">
            <div className="px-6 py-3.5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Members</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{membersLoading ? "—" : members.length}</p>
            </div>
            <div className="px-6 py-3.5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Type</p>
              <p className="text-sm font-semibold text-foreground mt-0.5 capitalize">{viewList.type?.replace("_", " ")}</p>
            </div>
            <div className="px-6 py-3.5">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Created</p>
              <p className="text-sm font-semibold text-foreground mt-0.5">{relativeTime(viewList.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Add members panel (manual / optin only) */}
        {(viewList.type === "manual" || viewList.type === "optin") && (
          <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">Add Members</p>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search contacts by name or email…" value={memberSearch} onChange={e => searchUsers(e.target.value)} className="pl-9 h-9 text-sm bg-background" />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            {memberSearchResults.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                {memberSearchResults.map(u => (
                  <div key={u.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/3 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0">
                      {u.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5 cursor-pointer h-7 px-3 text-xs" onClick={() => addUser(u.id)} disabled={addingUsers.includes(u.id)}>
                      {addingUsers.includes(u.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {memberSearch.trim() && !searching && memberSearchResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No users found matching "{memberSearch}"</p>
            )}
          </div>
        )}

        {/* Members table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <p className="text-sm font-semibold text-foreground">
                {membersLoading ? "Loading…" : `${members.length} Member${members.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>

          {/* Column header */}
          {!membersLoading && members.length > 0 && (
            <div className="grid grid-cols-[1fr_100px_110px_36px] gap-x-3 px-5 py-2.5 border-b border-border bg-muted/20">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Member</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Role</span>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Joined</span>
              <span />
            </div>
          )}

          {membersLoading ? (
            <div className="divide-y divide-border">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-muted/40 flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted/40 rounded w-32" />
                    <div className="h-2.5 bg-muted/30 rounded w-48" />
                  </div>
                  <div className="h-5 bg-muted/30 rounded w-16 hidden sm:block" />
                  <div className="h-3 bg-muted/30 rounded w-20 hidden md:block" />
                </div>
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No members yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {(viewList.type === "enrolled" || viewList.type === "all_subscribers")
                    ? 'Click "Sync Now" to populate this list automatically.'
                    : "Search for contacts above to add them to this list."}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {members.map(m => (
                <div key={m.id} className="grid grid-cols-[1fr_100px_110px_36px] items-center gap-x-3 px-5 py-3 hover:bg-white/3 transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary flex-shrink-0">
                      {m.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight truncate">{m.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize w-fit px-2 py-0.5">{m.role}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(m.subscribedAt ?? m.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <button
                    onClick={() => removeMember(m.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                    title="Remove member"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Lists table view ── */
  const filtered = lists.filter(l => l.name.toLowerCase().includes(listSearch.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalSubscribers = lists.reduce((s, l) => s + (l.memberCount ?? 0), 0);

  return (
    <div className="space-y-5">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <List className="w-4 h-4 text-muted-foreground" />
            Contact Lists
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Segment your audience into lists for targeted email campaigns and automations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search lists…"
              value={listSearch}
              onChange={e => { setListSearch(e.target.value); setCurrentPage(1); }}
              className="pl-8 h-8 text-xs w-44 bg-card border-border"
            />
          </div>
          <Button size="sm" className="gap-1.5 h-8 cursor-pointer font-medium" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5" />New List
          </Button>
        </div>
      </div>

      {/* ── Summary stat cards ── */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Lists", value: lists.length, icon: <List className="w-4 h-4" />, accent: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Total Subscribers", value: totalSubscribers.toLocaleString(), icon: <Users className="w-4 h-4" />, accent: "text-emerald-400", bg: "bg-emerald-500/10" },
            { label: "Manual Lists", value: lists.filter(l => l.type === "manual" || l.type === "optin").length, icon: <Edit2 className="w-4 h-4" />, accent: "text-amber-400", bg: "bg-amber-500/10" },
          ].map(card => (
            <div key={card.label} className="bg-card border border-border rounded-xl px-4 py-3.5 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${card.bg} flex items-center justify-center ${card.accent} flex-shrink-0`}>
                {card.icon}
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground font-medium">{card.label}</p>
                <p className="text-lg font-bold text-foreground leading-tight">{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[32px_1fr_140px_130px_130px_100px] items-center gap-x-4 px-5 py-3 border-b border-border bg-muted/20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary cursor-pointer" />
          <button className="flex items-center gap-1 hover:text-foreground transition-colors text-left">
            List Name <ArrowUpDown className="w-3 h-3 opacity-60" />
          </button>
          <span>Type</span>
          <button className="flex items-center gap-1 hover:text-foreground transition-colors text-left">
            Subscribers <ArrowUpDown className="w-3 h-3 opacity-60" />
          </button>
          <button className="flex items-center gap-1 hover:text-foreground transition-colors text-left">
            Created <ArrowUpDown className="w-3 h-3 opacity-60" />
          </button>
          <span>Actions</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="divide-y divide-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="grid grid-cols-[32px_1fr_140px_130px_130px_100px] items-center gap-x-4 px-5 py-4 animate-pulse">
                <div className="w-3.5 h-3.5 rounded bg-muted/40" />
                <div className="space-y-1.5">
                  <div className="h-3.5 bg-muted/40 rounded w-36" />
                  <div className="h-2.5 bg-muted/30 rounded w-52" />
                </div>
                <div className="h-5 bg-muted/30 rounded-full w-20" />
                <div className="h-3 bg-muted/30 rounded w-12" />
                <div className="h-3 bg-muted/30 rounded w-20" />
                <div className="flex gap-1.5">
                  <div className="w-7 h-7 rounded-lg bg-muted/30" />
                  <div className="w-7 h-7 rounded-lg bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        ) : paginated.length === 0 ? (
          <div className="py-20 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center">
              <List className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {listSearch ? `No lists matching "${listSearch}"` : "No lists yet"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {listSearch ? "Try a different search term." : "Create your first list to start segmenting your audience."}
              </p>
            </div>
            {!listSearch && (
              <Button size="sm" className="gap-1.5 cursor-pointer" onClick={() => setCreateOpen(true)}>
                <Plus className="w-3.5 h-3.5" />Create First List
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {paginated.map(list => {
              const meta = LIST_TYPE_META[list.type] ?? LIST_TYPE_META.manual;
              return (
                <div key={list.id} className="grid grid-cols-[32px_1fr_140px_130px_130px_100px] items-center gap-x-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors group">
                  <input type="checkbox" className="w-3.5 h-3.5 rounded accent-primary cursor-pointer" />

                  {/* Name + description */}
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center flex-shrink-0">
                      <List className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <button
                        onClick={() => openList(list)}
                        className="text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer text-left leading-tight block truncate max-w-full"
                      >
                        {list.name}
                        {list.isSystem && (
                          <span className="ml-2 text-[9px] uppercase tracking-wider text-muted-foreground font-medium border border-border rounded px-1 py-0.5 align-middle">System</span>
                        )}
                      </button>
                      {list.description ? (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">{list.description}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground/50 mt-0.5">{meta.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Type badge */}
                  <div>
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>

                  {/* Subscriber count */}
                  <div>
                    <p className="text-sm font-bold text-foreground">{(list.memberCount ?? 0).toLocaleString()}</p>
                    <p className="text-[11px] text-muted-foreground">contacts</p>
                  </div>

                  {/* Created */}
                  <span className="text-xs text-muted-foreground">{relativeTime(list.createdAt)}</span>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      title="Edit list"
                      onClick={() => { setEditList(list); setEditForm({ name: list.name, description: list.description ?? "", type: list.type }); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      title={(list.type === "enrolled" || list.type === "all_subscribers") ? "Sync members" : "View members"}
                      onClick={() => (list.type === "enrolled" || list.type === "all_subscribers") ? syncList(list) : openList(list)}
                      disabled={syncing === list.id}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {syncing === list.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : (list.type === "enrolled" || list.type === "all_subscribers")
                          ? <RotateCcw className="w-3.5 h-3.5" />
                          : <Users className="w-3.5 h-3.5" />}
                    </button>
                    {!list.isSystem && (
                      <button
                        title="Delete list"
                        onClick={() => deleteList(list.id)}
                        disabled={deleting === list.id}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {deleting === list.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Table footer / pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
            <span className="text-xs text-muted-foreground">
              Showing {Math.min((currentPage - 1) * pageSize + 1, filtered.length)}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} list{filtered.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-white/5 disabled:opacity-30 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                  <button
                    key={pg}
                    onClick={() => setCurrentPage(pg)}
                    className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      pg === currentPage
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-white/5 text-muted-foreground"
                    }`}
                  >
                    {pg}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-border hover:bg-white/5 disabled:opacity-30 cursor-pointer transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Create List Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                <List className="w-4 h-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base">Create New List</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">Segment your audience into a targeted contact list.</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">List Name <span className="text-red-400">*</span></Label>
              <Input
                placeholder="e.g. VIP Members, Newsletter Subscribers…"
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && createList()}
                className="h-9"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Type</Label>
              <select
                value={createForm.type}
                onChange={e => setCreateForm(f => ({ ...f, type: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="manual">Manual — you control membership</option>
                <option value="optin">Optin — populated via opt-in forms</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="Brief description of this list's purpose…"
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button onClick={createList} disabled={creating || !createForm.name.trim()} className="cursor-pointer gap-1.5">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Create List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit List Dialog ── */}
      <Dialog open={!!editList} onOpenChange={v => { if (!v) setEditList(null); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Edit2 className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <DialogTitle className="text-base">Edit List</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">Update the name or description of "{editList?.name}".</DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">List Name <span className="text-red-400">*</span></Label>
              <Input
                placeholder="e.g. VIP Members"
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && saveEdit()}
                className="h-9"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="Brief description…"
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                className="h-9"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditList(null)} className="cursor-pointer">Cancel</Button>
            <Button onClick={saveEdit} disabled={saving || !editForm.name.trim()} className="cursor-pointer gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ══════════════════════════════════════════════ TAGS ══════════════════════════════════════════════ */
const TAG_COLOR_PRESETS = ["#6366f1","#8b5cf6","#ec4899","#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#0ea5e9","#6b7280"];

function TagsTab() {
  const { toast } = useToast();
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [viewTag, setViewTag] = useState<any | null>(null);
  const [tagContacts, setTagContacts] = useState<any[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [removingContact, setRemovingContact] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", color: "#6366f1", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/api/admin/crm/tags");
    if (r.ok) setTags(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openViewTag = async (tag: any) => {
    setViewTag(tag);
    setContactsLoading(true);
    const r = await apiFetch(`/api/admin/crm/tags/${tag.id}/contacts`);
    if (r.ok) setTagContacts(await r.json());
    setContactsLoading(false);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (editing) {
      const r = await apiFetch(`/api/admin/crm/tags/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) { toast({ title: "Tag updated" }); setEditing(null); load(); }
    } else {
      const r = await apiFetch("/api/admin/crm/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (r.ok) { toast({ title: "Tag created" }); setCreating(false); setForm({ name: "", color: "#6366f1", description: "" }); load(); }
    }
    setSaving(false);
  };

  const del = async (id: number) => {
    if (!confirm("Delete this tag? It will be removed from all contacts.")) return;
    setDeleting(id);
    await apiFetch(`/api/admin/crm/tags/${id}`, { method: "DELETE" });
    toast({ title: "Tag deleted" }); load(); if (viewTag?.id === id) setViewTag(null);
    setDeleting(null);
  };

  const removeContact = async (userId: number) => {
    if (!viewTag) return;
    setRemovingContact(userId);
    await apiFetch(`/api/admin/crm/tags/${viewTag.id}/contacts/${userId}`, { method: "DELETE" });
    setTagContacts(c => c.filter(u => u.id !== userId));
    setRemovingContact(null);
    load();
  };

  const TagForm = () => (
    <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
      <p className="text-sm font-semibold">{editing ? "Edit Tag" : "Create New Tag"}</p>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Tag Name *</Label>
        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. VIP Customer" className="h-9" autoFocus />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Color</Label>
        <div className="flex items-center gap-2 flex-wrap">
          {TAG_COLOR_PRESETS.map(c => (
            <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
          ))}
          <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-7 h-7 rounded-full border-0 cursor-pointer p-0" title="Custom color" />
          <span className="text-xs text-muted-foreground">{form.color}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Description (optional)</Label>
        <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this tag for?" className="h-9" />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving || !form.name.trim()} className="cursor-pointer">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editing ? "Update Tag" : "Create Tag"}</Button>
        <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => { setCreating(false); setEditing(null); setForm({ name: "", color: "#6366f1", description: "" }); }}>Cancel</Button>
      </div>
    </div>
  );

  if (viewTag) return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 cursor-pointer" onClick={() => setViewTag(null)}><ChevronLeft className="w-4 h-4" />Back</Button>
        <div className="flex items-center gap-2 flex-1">
          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: viewTag.color }} />
          <h2 className="text-lg font-bold">{viewTag.name}</h2>
          <Badge variant="outline" className="text-xs ml-1">{tagContacts.length} contacts</Badge>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {contactsLoading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : tagContacts.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No contacts with this tag.</div>
        ) : (
          <div className="divide-y divide-border">
            {tagContacts.map(u => (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{u.name?.charAt(0)?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <Badge variant="outline" className="text-[10px] capitalize hidden sm:flex">{u.role}</Badge>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer" disabled={removingContact === u.id} onClick={() => removeContact(u.id)}>
                  {removingContact === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold">Contact Tags</h2><p className="text-sm text-muted-foreground mt-0.5">Segment your contacts with custom tags for targeted campaigns.</p></div>
        {!creating && !editing && <Button size="sm" className="gap-1.5 cursor-pointer" onClick={() => setCreating(true)}><Plus className="w-4 h-4" />New Tag</Button>}
      </div>
      {(creating || editing) && <TagForm />}
      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : tags.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-20 text-center">
          <Tag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold mb-1">No tags yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create tags to segment contacts for targeted email campaigns.</p>
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5 cursor-pointer"><Plus className="w-4 h-4" />Create Tag</Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tags.map(tag => (
            <div key={tag.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-primary/30 transition-colors">
              <div className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: tag.color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{tag.name}</p>
                  {tag.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tag.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3 h-3" /><span className="font-semibold text-foreground">{tag.subscriberCount}</span> contacts
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1 cursor-pointer" onClick={() => openViewTag(tag)}><Eye className="w-3 h-3" />View</Button>
                <Button size="sm" variant="outline" className="h-7 w-7 p-0 cursor-pointer" onClick={() => { setEditing(tag); setForm({ name: tag.name, color: tag.color, description: tag.description }); setCreating(false); }}><Edit2 className="w-3 h-3" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer" disabled={deleting === tag.id} onClick={() => del(tag.id)}>
                  {deleting === tag.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════ SEQUENCES ══════════════════════════════════════════════ */
const SEQ_TRIGGER_META: Record<string, { label: string; color: string; description: string }> = {
  manual:       { label: "Manual",     color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",   description: "Enroll contacts manually" },
  welcome:      { label: "On Signup",  color: "bg-blue-500/10 text-blue-400 border-blue-500/20",   description: "Fires when new user registers" },
  purchase:     { label: "On Purchase",color: "bg-green-500/10 text-green-400 border-green-500/20",description: "Fires after successful payment" },
  completion:   { label: "On Complete",color: "bg-purple-500/10 text-purple-400 border-purple-500/20",description: "Fires when course is completed" },
  tag_assigned: { label: "Tag Assigned",color: "bg-amber-500/10 text-amber-400 border-amber-500/20",description: "Fires when a tag is assigned" },
};

function SequencesTab() {
  const { toast } = useToast();
  const [sequences, setSequences] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewSeq, setViewSeq] = useState<any | null>(null);
  const [form, setForm] = useState({ name: "", description: "", trigger: "manual" });
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/api/admin/crm/sequences");
    if (r.ok) setSequences(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const r = await apiFetch("/api/admin/crm/sequences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) {
      const seq = await r.json();
      toast({ title: "Sequence created" });
      setCreating(false); setForm({ name: "", description: "", trigger: "manual" }); load();
      setViewSeq(seq);
    }
    setSaving(false);
  };

  const toggleActive = async (seq: any) => {
    await apiFetch(`/api/admin/crm/sequences/${seq.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !seq.isActive }) });
    load();
  };

  const del = async (id: number) => {
    if (!confirm("Delete this sequence?")) return;
    await apiFetch(`/api/admin/crm/sequences/${id}`, { method: "DELETE" });
    toast({ title: "Sequence deleted" }); load(); if (viewSeq?.id === id) setViewSeq(null);
  };

  const processNow = async () => {
    setProcessing(true);
    await apiFetch("/api/admin/crm/sequences/process", { method: "POST" });
    toast({ title: "Processed!", description: "Due sequence emails and scheduled campaigns have been processed." });
    setProcessing(false); load();
  };

  if (viewSeq) return <SequenceDetail seq={viewSeq} onBack={() => { setViewSeq(null); load(); }} />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-xl font-bold">Email Sequences</h2><p className="text-sm text-muted-foreground mt-0.5">Automated drip campaigns — send a series of emails on a schedule.</p></div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 cursor-pointer" onClick={processNow} disabled={processing}>
            {processing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Process Due
          </Button>
          {!creating && <Button size="sm" className="gap-1.5 cursor-pointer" onClick={() => setCreating(true)}><Plus className="w-4 h-4" />New Sequence</Button>}
        </div>
      </div>

      <div className="p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl text-xs text-blue-400 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />Sequences auto-process every 10 minutes. Click "Process Due" to run immediately.
      </div>

      {creating && (
        <div className="bg-card border border-primary/30 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold">New Sequence</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sequence Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 7-Day Onboarding" className="h-9" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Trigger</Label>
              <select value={form.trigger} onChange={e => setForm(f => ({ ...f, trigger: e.target.value }))}
                className="w-full h-9 px-2 rounded-md border border-border bg-background text-sm text-foreground">
                {Object.entries(SEQ_TRIGGER_META).map(([k, v]) => <option key={k} value={k}>{v.label} — {v.description}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description (optional)</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What does this sequence do?" className="h-9" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={create} disabled={saving || !form.name.trim()} className="cursor-pointer">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create & Add Steps"}</Button>
            <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : sequences.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-20 text-center">
          <GitBranch className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-semibold mb-1">No sequences yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create a drip sequence to automatically send a series of emails to contacts.</p>
          <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5 cursor-pointer"><Plus className="w-4 h-4" />Create Sequence</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map(seq => {
            const meta = SEQ_TRIGGER_META[seq.trigger] ?? SEQ_TRIGGER_META.manual;
            return (
              <div key={seq.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm truncate">{seq.name}</p>
                      <Badge variant="outline" className={`text-[10px] flex-shrink-0 border ${meta.color}`}>{meta.label}</Badge>
                      {seq.isActive ? (
                        <Badge variant="outline" className="text-[10px] text-green-400 border-green-400/30 bg-green-400/10">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Paused</Badge>
                      )}
                    </div>
                    {seq.description && <p className="text-xs text-muted-foreground mb-2">{seq.description}</p>}
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span><span className="font-semibold text-foreground">{seq.stepCount}</span> steps</span>
                      <span><span className="font-semibold text-foreground">{seq.enrolledCount}</span> enrolled</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1.5 cursor-pointer" onClick={() => setViewSeq(seq)}><Edit2 className="w-3 h-3" />Edit</Button>
                    <button onClick={() => toggleActive(seq)} className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${seq.isActive ? "border-green-400/30 text-green-400 hover:bg-green-400/10" : "border-border text-muted-foreground hover:text-foreground"}`} title={seq.isActive ? "Pause" : "Activate"}>
                      {seq.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => del(seq.id)} className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-400 hover:border-red-400/30 cursor-pointer transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SequenceDetail({ seq, onBack }: { seq: any; onBack: () => void }) {
  const { toast } = useToast();
  const [steps, setSteps] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingStep, setAddingStep] = useState(false);
  const [editingStep, setEditingStep] = useState<any | null>(null);
  const [savingStep, setSavingStep] = useState(false);
  const [deletingStep, setDeletingStep] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"steps" | "enrollments">("steps");
  const [stepForm, setStepForm] = useState({ subject: "", htmlBody: "", delayDays: 0 });
  const [enrollSearch, setEnrollSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [enrolling, setEnrolling] = useState<number[]>([]);
  const [unenrolling, setUnenrolling] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, e] = await Promise.all([
      apiFetch(`/api/admin/crm/sequences/${seq.id}/steps`).then(r => r.json()),
      apiFetch(`/api/admin/crm/sequences/${seq.id}/enrollments`).then(r => r.json()),
    ]);
    setSteps(Array.isArray(s) ? s : []); setEnrollments(Array.isArray(e) ? e : []);
    setLoading(false);
  }, [seq.id]);
  useEffect(() => { load(); }, [load]);

  const saveStep = async () => {
    if (!stepForm.subject.trim()) return;
    setSavingStep(true);
    if (editingStep) {
      await apiFetch(`/api/admin/crm/sequences/${seq.id}/steps/${editingStep.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stepForm) });
      toast({ title: "Step updated" });
    } else {
      await apiFetch(`/api/admin/crm/sequences/${seq.id}/steps`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...stepForm, stepOrder: steps.length + 1 }) });
      toast({ title: "Step added" });
    }
    setAddingStep(false); setEditingStep(null); setStepForm({ subject: "", htmlBody: "", delayDays: 0 }); load();
    setSavingStep(false);
  };

  const delStep = async (id: number) => {
    setDeletingStep(id);
    await apiFetch(`/api/admin/crm/sequences/${seq.id}/steps/${id}`, { method: "DELETE" });
    toast({ title: "Step removed" }); load();
    setDeletingStep(null);
  };

  const searchUsers = async (q: string) => {
    setEnrollSearch(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const params = new URLSearchParams({ search: q, limit: "10", offset: "0" });
    const r = await apiFetch(`/api/admin/crm/subscribers?${params}`);
    if (r.ok) { const d = await r.json(); setSearchResults(d.users ?? []); }
    setSearching(false);
  };

  const enrollUser = async (userId: number) => {
    setEnrolling(e => [...e, userId]);
    await apiFetch(`/api/admin/crm/sequences/${seq.id}/enrollments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: [userId] }) });
    toast({ title: "Enrolled" }); setSearchResults(r => r.filter(u => u.id !== userId)); load();
    setEnrolling(e => e.filter(i => i !== userId));
  };

  const unenroll = async (userId: number) => {
    setUnenrolling(e => [...e, userId]);
    await apiFetch(`/api/admin/crm/sequences/${seq.id}/enrollments/${userId}`, { method: "DELETE" });
    toast({ title: "Unenrolled" }); load();
    setUnenrolling(e => e.filter(i => i !== userId));
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 cursor-pointer" onClick={onBack}><ChevronLeft className="w-4 h-4" />Sequences</Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold">{seq.name}</h2>
          {seq.description && <p className="text-xs text-muted-foreground">{seq.description}</p>}
        </div>
        <Badge variant="outline" className={`text-[10px] border ${(SEQ_TRIGGER_META[seq.trigger] ?? SEQ_TRIGGER_META.manual).color}`}>{(SEQ_TRIGGER_META[seq.trigger] ?? SEQ_TRIGGER_META.manual).label}</Badge>
      </div>

      <div className="flex border-b border-border">
        {(["steps", "enrollments"] as const).map(t => (
          <button key={t} onClick={() => setDetailTab(t)} className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors cursor-pointer ${detailTab === t ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>{t} {t === "steps" ? `(${steps.length})` : `(${enrollments.length})`}</button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div> : (
        <>
          {detailTab === "steps" && (
            <div className="space-y-4">
              {steps.length === 0 && !addingStep && (
                <div className="bg-card border border-border rounded-xl py-12 text-center">
                  <Mail className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">No steps yet. Add the first email in this sequence.</p>
                </div>
              )}
              {steps.map((step, idx) => (
                <div key={step.id} className="bg-card border border-border rounded-xl p-4">
                  {editingStep?.id === step.id ? (
                    <StepForm form={stepForm} setForm={setStepForm} onSave={saveStep} onCancel={() => { setEditingStep(null); setStepForm({ subject: "", htmlBody: "", delayDays: 0 }); }} saving={savingStep} />
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 flex flex-col items-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{idx + 1}</div>
                        {idx < steps.length - 1 && <div className="w-0.5 h-8 bg-border" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-sm truncate">{step.subject}</p>
                          {step.delayDays > 0 && <Badge variant="outline" className="text-[10px] text-muted-foreground flex-shrink-0"><Clock className="w-2.5 h-2.5 mr-1" />Day {step.delayDays}</Badge>}
                          {step.delayDays === 0 && idx === 0 && <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-400/30 flex-shrink-0">Immediately</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 font-mono">{step.htmlBody.replace(/<[^>]+>/g, " ").slice(0, 100)}…</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {step.htmlBody && <button onClick={() => setPreviewing(step.htmlBody)} className="p-1.5 text-muted-foreground hover:text-foreground cursor-pointer" title="Preview"><Eye className="w-3.5 h-3.5" /></button>}
                        <button onClick={() => { setEditingStep(step); setStepForm({ subject: step.subject, htmlBody: step.htmlBody, delayDays: step.delayDays }); setAddingStep(false); }} className="p-1.5 text-muted-foreground hover:text-foreground cursor-pointer" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => delStep(step.id)} className="p-1.5 text-muted-foreground hover:text-red-400 cursor-pointer" disabled={deletingStep === step.id} title="Delete">
                          {deletingStep === step.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {addingStep && !editingStep && (
                <div className="bg-card border border-primary/30 rounded-xl p-4">
                  <p className="text-sm font-semibold mb-3">Step {steps.length + 1}</p>
                  <StepForm form={stepForm} setForm={setStepForm} onSave={saveStep} onCancel={() => { setAddingStep(false); setStepForm({ subject: "", htmlBody: "", delayDays: 0 }); }} saving={savingStep} />
                </div>
              )}

              {!addingStep && !editingStep && (
                <Button size="sm" variant="outline" className="gap-1.5 cursor-pointer w-full" onClick={() => { setAddingStep(true); setStepForm({ subject: "", htmlBody: "", delayDays: steps.length > 0 ? 1 : 0 }); }}>
                  <Plus className="w-4 h-4" />Add Step {steps.length + 1}
                </Button>
              )}
            </div>
          )}

          {detailTab === "enrollments" && (
            <div className="space-y-5">
              <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold">Enroll Contact</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Search by name or email…" value={enrollSearch} onChange={e => searchUsers(e.target.value)} className="pl-8 h-9 text-sm" />
                </div>
                {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                {searchResults.length > 0 && (
                  <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                    {searchResults.map(u => (
                      <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{u.name}</p>
                          <p className="text-xs text-muted-foreground">{u.email}</p>
                        </div>
                        <Button size="sm" variant="outline" className="gap-1 cursor-pointer h-7 px-2 text-xs" onClick={() => enrollUser(u.id)} disabled={enrolling.includes(u.id)}>
                          {enrolling.includes(u.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}Enroll
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <p className="text-sm font-semibold">{enrollments.length} Enrolled</p>
                </div>
                {enrollments.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">No contacts enrolled yet.</div>
                ) : (
                  <div className="divide-y divide-border">
                    {enrollments.map(e => (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">{e.userName?.charAt(0)?.toUpperCase()}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{e.userName}</p>
                          <p className="text-xs text-muted-foreground">{e.userEmail}</p>
                        </div>
                        <div className="text-right flex-shrink-0 space-y-0.5">
                          <Badge variant="outline" className={`text-[10px] capitalize ${e.status === "completed" ? "text-green-400 border-green-400/30" : e.status === "cancelled" ? "text-red-400 border-red-400/30" : "text-blue-400 border-blue-400/30"}`}>{e.status}</Badge>
                          {e.status === "active" && <p className="text-[11px] text-muted-foreground">Step {e.currentStep + 1}</p>}
                        </div>
                        {e.status === "active" && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer" disabled={unenrolling.includes(e.userId)} onClick={() => unenroll(e.userId)} title="Unenroll">
                            {unenrolling.includes(e.userId) ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {previewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Email Preview</h3>
              <button onClick={() => setPreviewing(null)} className="cursor-pointer"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <iframe srcDoc={previewing} className="w-full min-h-[480px] rounded-lg border border-border bg-white" title="preview" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepForm({ form, setForm, onSave, onCancel, saving }: { form: any; setForm: any; onSave: () => void; onCancel: () => void; saving: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Subject *</Label>
          <Input value={form.subject} onChange={e => setForm((f: any) => ({ ...f, subject: e.target.value }))} placeholder="e.g. Day 1: Welcome!" className="h-9 text-sm" autoFocus />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Delay from previous step (days)</Label>
          <Input type="number" min={0} value={form.delayDays} onChange={e => setForm((f: any) => ({ ...f, delayDays: parseInt(e.target.value) || 0 }))} className="h-9 text-sm" />
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">HTML Body</Label>
        </div>
        <Textarea value={form.htmlBody} onChange={e => setForm((f: any) => ({ ...f, htmlBody: e.target.value }))} className="font-mono text-xs min-h-[200px] resize-y" placeholder="<div>Your email HTML…</div>" />
      </div>
      <TemplateVariablesPanel type="campaign" />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving || !form.subject.trim()} className="cursor-pointer">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Step"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="cursor-pointer">Cancel</Button>
      </div>
    </div>
  );
}
