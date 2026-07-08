import type { TabDef } from './types';

// "Handover at destination" — where the patient is delivered, who to contact,
// arrival time, auto-calculated total transport time and the escort's
// handover letter to the receiving hospital or GP.

export const handover: TabDef = {
  id: 'handover',
  title: 'Handover at destination',
  sections: [
    {
      id: 'destination',
      title: 'Destination',
      fields: [
        {
          id: 'destinationType',
          type: 'choice',
          label: 'Patient handed over to',
          options: [
            { key: 'home', label: 'Home' },
            { key: 'hospital', label: 'Hospital' },
          ],
        },
        {
          id: 'destinationAddress',
          type: 'text',
          label: 'Hospital name / home address',
          placeholder: 'Fills in automatically from the case when Home or Hospital is selected — edit if different.',
        },
      ],
    },
    {
      id: 'contact-details',
      title: 'Contact details',
      fields: [
        { id: 'contactTel', type: 'text', label: 'Home/mobile tel no.', seedFrom: 'paxMobile' },
        { id: 'contactEmail', type: 'text', label: 'Email address', seedFrom: 'email' },
      ],
    },
    {
      id: 'arrival',
      title: 'Arrival',
      fields: [
        { id: 'arrivalDateTime', type: 'timestamp', label: 'Arrival date and time' },
        {
          id: 'totalTransportTime',
          type: 'transportTime',
          label: 'Total transport time',
        },
      ],
    },
    {
      id: 'handover-letter',
      title: 'Handover summary',
      fields: [
        {
          id: 'handoverLetter',
          type: 'text',
          tall: true,
          label: 'Summary / handover letter to the receiving hospital or GP',
          placeholder:
            'Clinical summary of the repatriation for the receiving team: condition during ' +
            'transfer, treatment given, concerns, follow-up needed…',
        },
      ],
    },
  ],
};
