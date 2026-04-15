import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';

const TopBar = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const term = month <= 4 ? `Spring ${year}` : month <= 7 ? `Summer ${year}` : `Fall ${year}`;

  return (
    <div className="flex-1 flex items-center justify-between">
      <div className="hidden sm:block">
        <h2 className="text-lg font-bold text-foreground font-serif">
          AKSOB Faculty Portfolio & AACSB Dashboard
        </h2>
        <p className="text-sm text-muted-foreground hidden lg:block">
          Faculty portfolio management, intellectual contributions tracking, and accreditation reporting
        </p>
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <Badge variant="outline" className="text-xs font-normal">
          {term}
        </Badge>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Shield className="h-3 w-3" />
          <span className="hidden sm:inline">AACSB Governed</span>
        </div>
      </div>
    </div>
  );
};

export default TopBar;
