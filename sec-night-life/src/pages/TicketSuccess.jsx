import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from "@/components/ui/button";
import { CheckCircle, Calendar, Download } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function TicketSuccess() {
  const navigate = useNavigate();

  useEffect(() => {
    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#00D4AA] to-[#00D4AA]/80 flex items-center justify-center mx-auto">
          <CheckCircle className="w-12 h-12 text-white" />
        </div>

        <div>
          <h1 className="text-3xl font-bold gradient-text mb-2">Payment Successful!</h1>
          <p className="text-gray-400">Your tickets have been confirmed</p>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-center gap-2 text-[#00D4AA]">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold">Tickets Confirmed</span>
          </div>
          <p className="text-gray-400 text-sm">
            A confirmation email has been sent to your inbox with your ticket details.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => navigate(createPageUrl('Events'))}
            className="w-full bg-gradient-to-r from-[#FF3366] to-[#7C3AED]"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Browse More Events
          </Button>
          <Button
            onClick={() => navigate(createPageUrl('Profile'))}
            variant="outline"
            className="w-full bg-[#141416] border-[#262629]"
          >
            View My Tickets
          </Button>
        </div>
      </div>
    </div>
  );
}