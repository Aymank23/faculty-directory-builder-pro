import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface TourStep {
  /** CSS selector for the target element */
  target: string;
  title: string;
  description: string;
}

interface DashboardTourProps {
  steps: TourStep[];
  storageKey: string;
}

const DashboardTour = ({ steps, storageKey }: DashboardTourProps) => {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placement: 'bottom' | 'top' }>({ top: 0, left: 0, placement: 'bottom' });
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Auto-show on first visit
  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      const timer = setTimeout(() => setActive(true), 800);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const positionTooltip = useCallback(() => {
    if (!active || !steps[currentStep]) return;
    const el = document.querySelector(steps[currentStep].target);
    if (!el) {
      // fallback: center of screen
      setTooltipPos({ top: window.innerHeight / 2 - 80, left: window.innerWidth / 2 - 160, placement: 'bottom' });
      return;
    }
    const rect = el.getBoundingClientRect();
    const tooltipW = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement = spaceBelow > 200 ? 'bottom' : 'top';
    let top = placement === 'bottom' ? rect.bottom + 12 : rect.top - 12;
    let left = Math.max(12, Math.min(rect.left + rect.width / 2 - tooltipW / 2, window.innerWidth - tooltipW - 12));
    setTooltipPos({ top, left, placement });
  }, [active, currentStep, steps]);

  useEffect(() => {
    positionTooltip();
    window.addEventListener('resize', positionTooltip);
    window.addEventListener('scroll', positionTooltip, true);
    return () => {
      window.removeEventListener('resize', positionTooltip);
      window.removeEventListener('scroll', positionTooltip, true);
    };
  }, [positionTooltip]);

  // Highlight effect
  useEffect(() => {
    if (!active) return;
    const el = steps[currentStep] ? document.querySelector(steps[currentStep].target) : null;
    if (el) {
      (el as HTMLElement).style.position = 'relative';
      (el as HTMLElement).style.zIndex = '60';
      (el as HTMLElement).style.boxShadow = '0 0 0 4px hsl(167 100% 20% / 0.3), 0 0 20px hsl(167 100% 20% / 0.15)';
      (el as HTMLElement).style.borderRadius = '8px';
      (el as HTMLElement).style.transition = 'box-shadow 0.3s ease';
    }
    return () => {
      if (el) {
        (el as HTMLElement).style.zIndex = '';
        (el as HTMLElement).style.boxShadow = '';
        (el as HTMLElement).style.borderRadius = '';
      }
    };
  }, [active, currentStep, steps]);

  const close = () => {
    setActive(false);
    localStorage.setItem(storageKey, 'true');
  };

  const next = () => {
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1);
    else close();
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const startTour = () => {
    setCurrentStep(0);
    setActive(true);
  };

  const step = steps[currentStep];

  return (
    <>
      {/* Help button to restart tour */}
      <Button
        variant="outline"
        size="sm"
        onClick={startTour}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Guide
      </Button>

      {active && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-foreground/20 backdrop-blur-[2px] z-50 transition-opacity duration-300"
            onClick={close}
          />

          {/* Tooltip */}
          <div
            ref={tooltipRef}
            className={cn(
              'fixed z-[70] w-80 bg-card border border-border rounded-lg shadow-lg p-4 transition-all duration-300',
              tooltipPos.placement === 'top' && '-translate-y-full'
            )}
            style={{ top: tooltipPos.top, left: tooltipPos.left }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs text-muted-foreground font-medium">
                  Step {currentStep + 1} of {steps.length}
                </p>
                <h4 className="text-sm font-semibold text-foreground font-serif">{step.title}</h4>
              </div>
              <button onClick={close} className="text-muted-foreground hover:text-foreground p-0.5">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-4">{step.description}</p>

            {/* Progress dots */}
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-1.5 rounded-full transition-all duration-200',
                      i === currentStep ? 'w-4 bg-primary' : 'w-1.5 bg-border'
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                {currentStep > 0 && (
                  <Button variant="ghost" size="sm" onClick={prev} className="h-7 px-2 text-xs">
                    <ChevronLeft className="h-3 w-3 mr-0.5" /> Back
                  </Button>
                )}
                <Button size="sm" onClick={next} className="h-7 px-3 text-xs">
                  {currentStep === steps.length - 1 ? 'Done' : 'Next'}
                  {currentStep < steps.length - 1 && <ChevronRight className="h-3 w-3 ml-0.5" />}
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default DashboardTour;
