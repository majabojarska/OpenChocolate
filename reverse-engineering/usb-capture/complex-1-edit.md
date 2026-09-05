# Initial state

TRS JACK set to TRS-MIDI
Polarity Reversal disabled

Device mode: advanced custom mode

- footswitch A:
  - Mode: Single tap (single group)
  - Bank A:
    - [1] 6 PC 11 0
  - Bank B: EMPTY (unsupported, single group mode)
- footswitch B:
  - Mode: Single tap (two groups)
  - Bank A:
    - [1] 11 CC 55 66
  - Bank B:
    - [1] 11 CC 55 66
- footswitch C:
  - Mode: Press-release
  - Bank A:
    - [1] 8 Note ON 77 88
  - Bank B:
    - [1] 9 Note ON 88 77
- footswitch D:
  - Mode: long press
  - Bank A:
    - [1] 5 CC 22 33
  - Bank B: EMPTY (unsupported, single group mode)

# Edit operation

During the edit, footswitch B was kept at mode "single tap (two groups)" and the following changes were made:
- Bank A, entry [1] was changed from "[1] 11 CC 55 66" to "[1] 9 NoteOFF 12 34"


# USB capture contents

1. device open, application reads back all configuration
2. application writes the partial configuration edit
