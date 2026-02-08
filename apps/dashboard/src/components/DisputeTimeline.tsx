import React from 'react';
import { DisputeEvent } from '../types';

export default function DisputeTimeline({ events }: { events: DisputeEvent[] }) {
  return (
    <div className="card">
      <h2>Dispute Timeline</h2>
      {events.length === 0 ? (
        <p>No disputes recorded.</p>
      ) : (
        <div className="timeline">
          {events.map((event) => (
            <div key={event.id} className="timeline-item">
              <strong>{event.type}</strong> · {event.status}
              <div>{new Date(event.timestamp).toLocaleString()}</div>
              <p>{event.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
