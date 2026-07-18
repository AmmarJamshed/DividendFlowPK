from divflowpsx.delay import DelayGate


def test_delay_gate_rejects_negative():
    try:
        DelayGate(-1)
        assert False
    except ValueError:
        assert True


def test_version():
    import divflowpsx
    assert divflowpsx.__version__
