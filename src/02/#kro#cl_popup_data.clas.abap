CLASS /kro/cl_popup_data DEFINITION PUBLIC.

  PUBLIC SECTION.
    INTERFACES /kro/if_app.
    " check_confirmed( ) - always abap_true, the popup only shows data;
    " value( ) - the data shown (mr_data); value_string( ) - empty
    INTERFACES /kro/if_popup_result.

    CLASS-METHODS factory
      IMPORTING
        val             TYPE any
        title           TYPE clike OPTIONAL
      RETURNING
        VALUE(r_result) TYPE REF TO /kro/cl_popup_data.

    DATA mr_data TYPE REF TO data.

  PROTECTED SECTION.
    DATA title  TYPE string VALUE `Table View`.
    DATA client TYPE REF TO /kro/if_client.

    METHODS display.

  PRIVATE SECTION.
ENDCLASS.


CLASS /kro/cl_popup_data IMPLEMENTATION.

  METHOD display.

    FIELD-SYMBOLS <data> TYPE any.
      DATA lt_result TYPE /kro/cl_popup_context=>ty_t_name_value.

    ASSIGN mr_data->* TO <data>.

    IF /kro/cl_popup_context=>rtti_check_table( <data> ) IS NOT INITIAL.

      client->nav_app_call( /kro/cl_popup_table=>factory( i_tab   = <data>
                                                         i_title = title ) ).

    ELSEIF /kro/cl_popup_context=>rtti_check_structure( <data> ) IS NOT INITIAL.


      lt_result = /kro/cl_popup_context=>itab_get_by_struc( <data> ).
      client->nav_app_call( /kro/cl_popup_table=>factory( i_tab   = lt_result
                                                         i_title = title ) ).

    ENDIF.

  ENDMETHOD.

  METHOD factory.

    FIELD-SYMBOLS <data> TYPE any.

    CREATE OBJECT r_result.
    IF title IS NOT INITIAL.
      r_result->title = title.
    ENDIF.
    CREATE DATA r_result->mr_data LIKE val.

    ASSIGN r_result->mr_data->* TO <data>.
    <data> = val.

  ENDMETHOD.

  METHOD /kro/if_app~main.

    me->client = client.
    IF client->check_on_init( ) IS NOT INITIAL.
      display( ).
      RETURN.
    ENDIF.
    client->nav_app_leave( ).

  ENDMETHOD.

  METHOD /kro/if_popup_result~check_confirmed.

    " shows something only - nothing to decline
    result = abap_true.

  ENDMETHOD.

  METHOD /kro/if_popup_result~value.

    result = mr_data.

  ENDMETHOD.

  METHOD /kro/if_popup_result~value_string.

    " no single value - empty
    CLEAR result.

  ENDMETHOD.

ENDCLASS.
