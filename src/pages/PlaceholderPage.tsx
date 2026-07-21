import React from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/States';
import { HardHat } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title }) => {
  return (
    <div>
      <PageHeader title={title} />
      <div className="mt-8">
        <EmptyState 
          icon={HardHat}
          title="Under Construction"
          message="This module is scheduled for a later build phase."
        />
      </div>
    </div>
  );
};
