import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  announcementPgRowSnapshot,
  computeAnnouncementDetailedDiffs,
  announcementAuditDescription,
  announcementAuditDetails,
} from '../server/lib/announcementAudit.js'

describe('announcementAudit', () => {
  it('announcementPgRowSnapshot maps PostgreSQL row fields', () => {
    const snap = announcementPgRowSnapshot({
      id: 3,
      title: 'Buwan ng Wika',
      type: 'Event',
      message: 'Celebration details here',
      image_name: 'poster.png',
    })
    assert.equal(snap.id, '3')
    assert.equal(snap.title, 'Buwan ng Wika')
    assert.equal(snap.type, 'Event')
    assert.equal(snap.imageName, 'poster.png')
  })

  it('computeAnnouncementDetailedDiffs returns Old/New pairs for changed fields', () => {
    const diffs = computeAnnouncementDetailedDiffs(
      {
        title: 'Old Title',
        type: 'News',
        message: 'Old message',
        image_name: 'old.png',
      },
      {
        title: 'New Title',
        type: 'Event',
        message: 'New message',
        image_name: 'new.png',
      },
    )
    assert.deepEqual(diffs.Title, { old: 'Old Title', new: 'New Title' })
    assert.deepEqual(diffs['Announcement type'], { old: 'News', new: 'Event' })
    assert.deepEqual(diffs.Message, { old: 'Old message', new: 'New message' })
    assert.ok(diffs['Announcement image'])
  })

  it('announcementAuditDescription and announcementAuditDetails format audit payload', () => {
    const snap = announcementPgRowSnapshot({ id: 2, title: 'Campus Update', type: 'Institute' })
    assert.equal(announcementAuditDescription('deleted', snap), 'Announcement deleted: Campus Update')
    const details = announcementAuditDetails(snap)
    assert.equal(details.recordId, '2')
    assert.equal(details.title, 'Campus Update')
    assert.equal(details.announcementType, 'Institute')
  })
})
