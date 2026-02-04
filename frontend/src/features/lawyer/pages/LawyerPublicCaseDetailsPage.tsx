import React from "react";
import PublicCaseDetailsPage from "../../publicFeed/pages/PublicCaseDetailsPage";

export default function LawyerPublicCaseDetailsPage() {
  return (
    <PublicCaseDetailsPage
      backTo="/lawyer/cases/feed"
      showAuthModalForGuests={true}
    />
  );
}
